import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../core/l10n.dart';
import '../core/theme.dart';
import 'chat_screen.dart';

/// Active order flow: map with pickup/dropoff, one-tap status advance,
/// external turn-by-turn navigation, call & chat with the customer.
class ActiveOrderScreen extends StatefulWidget {
  final String orderId;
  const ActiveOrderScreen({super.key, required this.orderId});

  @override
  State<ActiveOrderScreen> createState() => _ActiveOrderScreenState();
}

class _ActiveOrderScreenState extends State<ActiveOrderScreen> {
  Map<String, dynamic>? _order;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await Api.get('/orders/${widget.orderId}');
    if (!mounted) return;
    setState(() => _order = Map<String, dynamic>.from((data as Map)['order'] as Map));
  }

  static const _next = {
    'ACCEPTED': ('ARRIVED_PICKUP', 'arrivedPickup', Icons.flag),
    'ARRIVED_PICKUP': ('PICKED_UP', 'pickedUp', Icons.inventory_2),
    'PICKED_UP': ('IN_TRANSIT', 'inTransit', Icons.local_shipping),
    'IN_TRANSIT': ('DELIVERED', 'delivered', Icons.check_circle),
  };

  Future<void> _advance(String status) async {
    HapticFeedback.mediumImpact();
    try {
      await Api.post('/orders/${widget.orderId}/status', {'status': status});
      if (status == 'DELIVERED' && mounted) {
        Navigator.pop(context);
        return;
      }
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  void _navigateTo(double lat, double lng) {
    // Opens Google Maps / any installed navigation app for turn-by-turn.
    launchUrl(
      Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng'),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final order = _order;
    if (order == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final status = order['status'] as String;
    final customer = order['customer'] as Map<String, dynamic>?;
    final pickup = LatLng(
        (order['pickupLat'] as num).toDouble(), (order['pickupLng'] as num).toDouble());
    final dropoff = LatLng(
        (order['dropoffLat'] as num).toDouble(), (order['dropoffLng'] as num).toDouble());
    final headingToPickup = status == 'ACCEPTED' || status == 'ARRIVED_PICKUP';
    final target = headingToPickup ? pickup : dropoff;
    final next = _next[status];

    return Scaffold(
      appBar: AppBar(title: Text(order['code'] as String)),
      body: Column(children: [
        Expanded(
          child: FlutterMap(
            options: MapOptions(initialCenter: target, initialZoom: 14),
            children: [
              TileLayer(
                urlTemplate: AppConfig.tileUrl,
                userAgentPackageName: 'mr.meshily.driver',
              ),
              PolylineLayer(polylines: [
                Polyline(
                    points: [pickup, dropoff],
                    color: MeshilyColors.primary,
                    strokeWidth: 4),
              ]),
              MarkerLayer(markers: [
                Marker(point: pickup, width: 36, height: 36,
                    child: const Icon(Icons.trip_origin,
                        color: MeshilyColors.success, size: 30)),
                Marker(point: dropoff, width: 40, height: 40,
                    child: const Icon(Icons.location_on,
                        color: MeshilyColors.danger, size: 36)),
              ]),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(children: [
                    Row(children: [
                      const Icon(Icons.trip_origin,
                          color: MeshilyColors.success, size: 18),
                      const SizedBox(width: 6),
                      Expanded(child: Text(order['pickupAddress'] as String)),
                    ]),
                    const SizedBox(height: 6),
                    Row(children: [
                      const Icon(Icons.location_on,
                          color: MeshilyColors.danger, size: 18),
                      const SizedBox(width: 6),
                      Expanded(child: Text(order['dropoffAddress'] as String)),
                    ]),
                    const Divider(),
                    Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Text('${order['distanceKm']} km'),
                      Text(
                        '${l.t('yourEarning')}: ${order['driverEarning']} ${l.t('mru')}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: MeshilyColors.primary),
                      ),
                      Text(order['paymentMethod'] as String),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.navigation),
                    label: Text(l.t('navigate')),
                    onPressed: () => _navigateTo(target.latitude, target.longitude),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  icon: const Icon(Icons.phone),
                  onPressed: customer == null
                      ? null
                      : () => launchUrl(Uri.parse('tel:${customer['phone']}')),
                ),
                IconButton.filledTonal(
                  icon: const Icon(Icons.chat),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ChatScreen(orderId: widget.orderId)),
                  ),
                ),
              ]),
              const SizedBox(height: 8),
              if (next != null)
                FilledButton.icon(
                  icon: Icon(next.$3),
                  label: Text(l.t(next.$2)),
                  onPressed: () => _advance(next.$1),
                ),
            ]),
          ),
        ),
      ]),
    );
  }
}
