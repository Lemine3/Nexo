import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../core/l10n.dart';
import '../core/session.dart';
import '../core/socket_service.dart';
import '../core/theme.dart';
import 'active_order_screen.dart';
import 'earnings_screen.dart';
import 'settings_screen.dart';
import 'withdrawals_screen.dart';

/// Driver home: availability toggle, GPS → server streaming while online,
/// incoming offers as a countdown dialog, and quick access to the active order.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _profile;
  bool _online = false;
  LatLng? _pos;
  StreamSubscription<Position>? _gps;
  Map<String, dynamic>? _activeOrder;
  final _map = MapController();

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadActiveOrder();
    _listenOffers();
  }

  Future<void> _loadProfile() async {
    try {
      final data = await Api.get('/drivers/me');
      if (!mounted) return;
      setState(() {
        _profile = Map<String, dynamic>.from((data as Map)['profile'] as Map);
        _online = _profile!['online'] == true;
      });
    } on ApiException catch (_) {}
  }

  Future<void> _loadActiveOrder() async {
    final data = await Api.get('/orders?limit=5');
    if (!mounted) return;
    final orders = ((data as Map)['orders'] as List).cast<Map>();
    final active = orders.where((o) =>
        ['ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].contains(o['status']));
    setState(() =>
        _activeOrder = active.isEmpty ? null : Map<String, dynamic>.from(active.first));
  }

  // ── Availability & GPS streaming ────────────────────────────

  Future<bool> _ensureLocation() async {
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(L10n.of(context).t('locationNeeded'))));
      }
      return false;
    }
    return true;
  }

  Future<void> _toggleOnline(bool value) async {
    if (value && !await _ensureLocation()) return;
    Position? pos;
    if (value) {
      pos = await Geolocator.getCurrentPosition();
      setState(() => _pos = LatLng(pos!.latitude, pos.longitude));
      _map.move(_pos!, 14);
    }
    try {
      await Api.post('/drivers/availability', {
        'online': value,
        if (pos != null) 'lat': pos.latitude,
        if (pos != null) 'lng': pos.longitude,
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    setState(() => _online = value);
    if (value) {
      _startGps();
    } else {
      await _gps?.cancel();
      _gps = null;
    }
  }

  void _startGps() {
    final socket = SocketService.connect();
    _gps?.cancel();
    _gps = Geolocator.getPositionStream(
      locationSettings:
          const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 15),
    ).listen((p) {
      if (mounted) setState(() => _pos = LatLng(p.latitude, p.longitude));
      socket.emit('location:update', {
        'lat': p.latitude,
        'lng': p.longitude,
        'heading': p.heading,
      });
    });
  }

  // ── Incoming offers ─────────────────────────────────────────

  void _listenOffers() {
    final socket = SocketService.connect();
    socket.on('order:offer', (data) {
      if (!mounted || data is! Map || _activeOrder != null) return;
      _showOffer(Map<String, dynamic>.from(data));
    });
  }

  Future<void> _showOffer(Map<String, dynamic> offer) async {
    final l = L10n.of(context);
    int remaining = (offer['expiresInSec'] as num?)?.toInt() ?? 25;
    Timer? timer;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setDlg) {
        timer ??= Timer.periodic(const Duration(seconds: 1), (t) {
          remaining--;
          if (remaining <= 0) {
            t.cancel();
            if (ctx.mounted) Navigator.pop(ctx);
          } else {
            setDlg(() {});
          }
        });
        return AlertDialog(
          title: Row(children: [
            Expanded(child: Text(l.t('newOffer'))),
            CircleAvatar(
              radius: 17,
              backgroundColor: MeshilyColors.primary,
              child: Text('$remaining',
                  style: const TextStyle(color: Colors.white, fontSize: 13)),
            ),
          ]),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            _offerRow(Icons.trip_origin, MeshilyColors.success,
                '${l.t('pickup')}: ${offer['pickup']?['address'] ?? ''}'),
            _offerRow(Icons.location_on, MeshilyColors.danger,
                '${l.t('dropoff')}: ${offer['dropoff']?['address'] ?? ''}'),
            const SizedBox(height: 8),
            Text(
              '${l.t('yourEarning')}: ${offer['driverEarning']} ${l.t('mru')}  •  ${offer['distanceKm']} km',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.t('declineOffer'))),
            FilledButton(
              onPressed: () async {
                try {
                  await Api.post('/orders/${offer['orderId']}/accept');
                  if (ctx.mounted) Navigator.pop(ctx);
                  await _loadActiveOrder();
                  if (mounted && _activeOrder != null) {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) =>
                              ActiveOrderScreen(orderId: _activeOrder!['id'] as String)),
                    ).then((_) => _loadActiveOrder());
                  }
                } on ApiException catch (e) {
                  if (ctx.mounted) {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context)
                        .showSnackBar(SnackBar(content: Text(e.message)));
                  }
                }
              },
              child: Text(l.t('accept')),
            ),
          ],
        );
      }),
    );
    timer?.cancel();
  }

  Widget _offerRow(IconData icon, Color color, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 6),
          Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis)),
        ]),
      );

  @override
  void dispose() {
    _gps?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final session = context.watch<Session>();
    final approval = _profile?['approvalStatus'] as String?;

    return Scaffold(
      appBar: AppBar(title: Text(l.t('appName'))),
      drawer: Drawer(
        child: ListView(children: [
          UserAccountsDrawerHeader(
            decoration: const BoxDecoration(color: MeshilyColors.navy),
            accountName: Text(session.user?['name']?.toString() ?? ''),
            accountEmail: Text(session.user?['phone']?.toString() ?? ''),
            currentAccountPicture: const CircleAvatar(
              backgroundColor: MeshilyColors.primary,
              child: Icon(Icons.two_wheeler, color: Colors.white),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.payments),
            title: Text(l.t('earnings')),
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const EarningsScreen())),
          ),
          ListTile(
            leading: const Icon(Icons.account_balance),
            title: Text(l.t('withdrawals')),
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const WithdrawalsScreen())),
          ),
          ListTile(
            leading: const Icon(Icons.settings),
            title: Text(l.t('settings')),
            onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
          ),
        ]),
      ),
      body: Stack(children: [
        FlutterMap(
          mapController: _map,
          options: const MapOptions(
            initialCenter: LatLng(AppConfig.defaultLat, AppConfig.defaultLng),
            initialZoom: 13,
          ),
          children: [
            TileLayer(
              urlTemplate: AppConfig.tileUrl,
              userAgentPackageName: 'mr.meshily.driver',
            ),
            if (_pos != null)
              MarkerLayer(markers: [
                Marker(
                  point: _pos!,
                  width: 46,
                  height: 46,
                  child: Text(
                    _profile?['vehicleType'] == 'TRUCK' ? '🚚' : '🛵',
                    style: const TextStyle(fontSize: 34),
                  ),
                ),
              ]),
          ],
        ),
        if (approval == 'PENDING')
          Positioned(
            top: 12, left: 12, right: 12,
            child: Card(
              color: Colors.amber.shade100,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(l.t('pendingApproval'),
                    style: const TextStyle(color: Colors.black87)),
              ),
            ),
          ),
        if (_activeOrder != null)
          Positioned(
            bottom: 12, left: 12, right: 12,
            child: Card(
              color: MeshilyColors.navy,
              child: ListTile(
                title: Text(l.t('currentOrder'),
                    style: const TextStyle(color: Colors.white70, fontSize: 13)),
                subtitle: Text(
                  '${_activeOrder!['pickupAddress']} ← ${_activeOrder!['dropoffAddress']}',
                  style: const TextStyle(color: Colors.white),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: const Icon(Icons.chevron_left, color: Colors.white),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) =>
                          ActiveOrderScreen(orderId: _activeOrder!['id'] as String)),
                ).then((_) => _loadActiveOrder()),
              ),
            ),
          ),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            decoration: BoxDecoration(
              color: _online ? MeshilyColors.success : Colors.grey.shade400,
              borderRadius: BorderRadius.circular(16),
            ),
            child: SwitchListTile(
              value: _online,
              onChanged: approval == 'APPROVED' ? _toggleOnline : null,
              title: Text(
                _online ? l.t('online') : l.t('offline'),
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17),
              ),
              activeColor: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
