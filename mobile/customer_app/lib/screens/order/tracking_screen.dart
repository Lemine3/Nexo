import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/l10n.dart';
import '../../core/socket_service.dart';
import '../../core/theme.dart';
import 'chat_screen.dart';

/// Live tracking: driver marker glides between socket updates
/// (interpolation animation instead of jumping), status timeline,
/// call / chat shortcuts, and the rating dialog on delivery.
class TrackingScreen extends StatefulWidget {
  final String orderId;
  const TrackingScreen({super.key, required this.orderId});

  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen>
    with SingleTickerProviderStateMixin {
  Map<String, dynamic>? _order;
  LatLng? _driverPos;
  LatLng? _driverPrev;
  late final AnimationController _anim = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900));

  static const _statusOrder = [
    'PENDING', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'
  ];

  @override
  void initState() {
    super.initState();
    _load();
    _subscribe();
    _anim.addListener(() => setState(() {}));
  }

  Future<void> _load() async {
    final data = await Api.get('/orders/${widget.orderId}');
    if (!mounted) return;
    setState(() => _order = Map<String, dynamic>.from((data as Map)['order'] as Map));
  }

  void _subscribe() {
    final socket = SocketService.connect();
    void join() => socket.emitWithAck('order:subscribe', {'orderId': widget.orderId}, ack: (_) {});
    if (socket.connected) join();
    socket.onConnect((_) => join());

    socket.on('driver:location', (data) {
      if (!mounted || data is! Map) return;
      final next = LatLng((data['lat'] as num).toDouble(), (data['lng'] as num).toDouble());
      setState(() {
        _driverPrev = _driverPos ?? next;
        _driverPos = next;
      });
      _anim.forward(from: 0);
    });

    socket.on('order:status', (data) async {
      if (!mounted || data is! Map || data['orderId'] != widget.orderId) return;
      await _load();
      if (data['status'] == 'DELIVERED' && mounted) _showRatingDialog();
    });

    socket.on('order:no_driver', (data) {
      if (!mounted || data is! Map || data['orderId'] != widget.orderId) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(L10n.of(context).t('noDriverFound'))),
      );
    });
  }

  LatLng? get _animatedDriverPos {
    if (_driverPos == null) return null;
    if (_driverPrev == null) return _driverPos;
    final t = Curves.easeInOut.transform(_anim.value);
    return LatLng(
      _driverPrev!.latitude + (_driverPos!.latitude - _driverPrev!.latitude) * t,
      _driverPrev!.longitude + (_driverPos!.longitude - _driverPrev!.longitude) * t,
    );
  }

  Future<void> _showRatingDialog() async {
    int stars = 5;
    final comment = TextEditingController();
    final l = L10n.of(context);
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: Text(l.t('rateDriver')),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(l.t('rateHint')),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (i) {
                return IconButton(
                  icon: Icon(
                    i < stars ? Icons.star : Icons.star_border,
                    color: Colors.amber,
                    size: 32,
                  ),
                  onPressed: () => setDlg(() => stars = i + 1),
                );
              }),
            ),
            TextField(controller: comment, decoration: InputDecoration(hintText: l.t('notes'))),
          ]),
          actions: [
            FilledButton(
              onPressed: () async {
                await Api.post('/orders/${widget.orderId}/rate', {
                  'stars': stars,
                  if (comment.text.isNotEmpty) 'comment': comment.text,
                }).catchError((_) => {});
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: Text(l.t('submit')),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final order = _order;
    if (order == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final status = order['status'] as String;
    final driver = order['driver'] as Map<String, dynamic>?;
    final pickup = LatLng((order['pickupLat'] as num).toDouble(), (order['pickupLng'] as num).toDouble());
    final dropoff = LatLng((order['dropoffLat'] as num).toDouble(), (order['dropoffLng'] as num).toDouble());
    final driverPos = _animatedDriverPos;

    return Scaffold(
      appBar: AppBar(title: Text(order['code'] as String)),
      body: Column(children: [
        Expanded(
          child: FlutterMap(
            options: MapOptions(initialCenter: pickup, initialZoom: 13),
            children: [
              TileLayer(
                urlTemplate: AppConfig.tileUrl,
                userAgentPackageName: 'mr.meshily.customer',
              ),
              PolylineLayer(polylines: [
                Polyline(points: [pickup, dropoff], color: MeshilyColors.primary, strokeWidth: 4),
              ]),
              MarkerLayer(markers: [
                Marker(point: pickup, width: 36, height: 36,
                    child: const Icon(Icons.trip_origin, color: MeshilyColors.success, size: 30)),
                Marker(point: dropoff, width: 40, height: 40,
                    child: const Icon(Icons.location_on, color: MeshilyColors.danger, size: 36)),
                if (driverPos != null)
                  Marker(
                    point: driverPos,
                    width: 44,
                    height: 44,
                    child: Text(order['vehicleType'] == 'MOTO' ? '🛵' : '🚚',
                        style: const TextStyle(fontSize: 32)),
                  ),
              ]),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _statusTimeline(status, l),
              const SizedBox(height: 12),
              if (driver != null)
                Card(
                  child: ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: MeshilyColors.primary,
                      child: Icon(Icons.person, color: Colors.white),
                    ),
                    title: Text(driver['name'] as String),
                    subtitle: Text(
                        '⭐ ${driver['driverProfile']?['ratingAvg'] ?? '-'} • ${driver['driverProfile']?['plateNumber'] ?? ''}'),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      IconButton(
                        icon: const Icon(Icons.phone, color: MeshilyColors.success),
                        onPressed: () =>
                            launchUrl(Uri.parse('tel:${driver['phone']}')),
                      ),
                      IconButton(
                        icon: const Icon(Icons.chat, color: MeshilyColors.primary),
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => ChatScreen(orderId: widget.orderId)),
                        ),
                      ),
                    ]),
                  ),
                ),
              if (status == 'PENDING')
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(children: [
                    const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2)),
                    const SizedBox(width: 10),
                    Text(l.t('searchingDriver')),
                    const Spacer(),
                    TextButton(
                      onPressed: () async {
                        await Api.post('/orders/${widget.orderId}/cancel', {});
                        if (context.mounted) Navigator.pop(context);
                      },
                      child: Text(l.t('cancelOrder'),
                          style: const TextStyle(color: MeshilyColors.danger)),
                    ),
                  ]),
                ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _statusTimeline(String status, L10n l) {
    const labels = {
      'ACCEPTED': 'orderAccepted',
      'ARRIVED_PICKUP': 'arrivedPickup',
      'PICKED_UP': 'pickedUp',
      'IN_TRANSIT': 'inTransit',
      'DELIVERED': 'delivered',
    };
    if (status == 'CANCELLED') {
      return Text(l.t('cancelled'),
          style: const TextStyle(color: MeshilyColors.danger, fontWeight: FontWeight.w700));
    }
    final idx = _statusOrder.indexOf(status);
    return Row(
      children: labels.keys.map((s) {
        final done = _statusOrder.indexOf(s) <= idx;
        return Expanded(
          child: Column(children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 400),
              height: 6,
              margin: const EdgeInsets.symmetric(horizontal: 2),
              decoration: BoxDecoration(
                color: done ? MeshilyColors.primary : Colors.grey.shade300,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            if (s == status)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(l.t(labels[s]!),
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                    textAlign: TextAlign.center),
              ),
          ]),
        );
      }).toList(),
    );
  }
}
