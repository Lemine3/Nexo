import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../core/config.dart';
import '../core/l10n.dart';
import '../core/session.dart';
import '../core/socket_service.dart';
import '../core/theme.dart';
import 'history_screen.dart';
import 'order/create_order_screen.dart';
import 'settings_screen.dart';
import 'wallet_screen.dart';

/// Home: live map of Nouakchott with nearby drivers refreshing in realtime.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _mapController = MapController();
  List<Map<String, dynamic>> _nearby = [];
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _startNearbyPolling();
  }

  void _startNearbyPolling() {
    final socket = SocketService.connect();
    void ask() {
      final c = _mapController.camera.center;
      socket.emitWithAck('drivers:nearby', {
        'lat': c.latitude,
        'lng': c.longitude,
      }, ack: (data) {
        if (!mounted || data is! List) return;
        setState(() => _nearby = data.cast<Map<String, dynamic>>());
      });
    }

    socket.onConnect((_) => ask());
    _pollTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (socket.connected) ask();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final session = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(title: Text(l.t('appName'))),
      drawer: Drawer(
        child: ListView(
          children: [
            UserAccountsDrawerHeader(
              decoration: const BoxDecoration(color: MeshilyColors.navy),
              accountName: Text(session.user?['name']?.toString() ?? ''),
              accountEmail: Text(session.user?['phone']?.toString() ?? ''),
              currentAccountPicture: const CircleAvatar(
                backgroundColor: MeshilyColors.primary,
                child: Icon(Icons.person, color: Colors.white),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.receipt_long),
              title: Text(l.t('history')),
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const HistoryScreen())),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_wallet),
              title: Text(l.t('walletTitle')),
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const WalletScreen())),
            ),
            ListTile(
              leading: const Icon(Icons.settings),
              title: Text(l.t('settings')),
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const SettingsScreen())),
            ),
          ],
        ),
      ),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: const MapOptions(
              initialCenter: LatLng(AppConfig.defaultLat, AppConfig.defaultLng),
              initialZoom: 13,
            ),
            children: [
              TileLayer(
                urlTemplate: AppConfig.tileUrl,
                userAgentPackageName: 'mr.meshily.customer',
              ),
              MarkerLayer(
                markers: _nearby
                    .map(
                      (d) => Marker(
                        point: LatLng((d['lat'] as num).toDouble(), (d['lng'] as num).toDouble()),
                        width: 44,
                        height: 44,
                        child: AnimatedScale(
                          scale: 1,
                          duration: const Duration(milliseconds: 300),
                          child: Text(
                            d['vehicleType'] == 'MOTO' ? '🛵' : '🚚',
                            style: const TextStyle(fontSize: 30),
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ],
          ),
          Positioned(
            top: 12,
            left: 12,
            right: 12,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.sports_motorsports, color: MeshilyColors.primary),
                    const SizedBox(width: 8),
                    Text('${_nearby.length} ${l.t('nearbyDrivers')}'),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton.icon(
            icon: const Icon(Icons.add_location_alt),
            label: Text(l.t('newOrder')),
            onPressed: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const CreateOrderScreen())),
          ),
        ),
      ),
    );
  }
}
