import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../core/api.dart';
import '../../core/config.dart';
import '../../core/l10n.dart';
import '../../core/theme.dart';
import 'tracking_screen.dart';

/// Three steps on one screen:
/// 1) pick pickup & dropoff on the map (with neighborhood quick-search)
/// 2) choose vehicle type — the price quote updates instantly
/// 3) choose payment method and confirm.
class CreateOrderScreen extends StatefulWidget {
  const CreateOrderScreen({super.key});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  final _map = MapController();
  LatLng? _pickup;
  LatLng? _dropoff;
  String _pickupLabel = '';
  String _dropoffLabel = '';
  bool _pickingPickup = true;

  String _vehicle = 'MOTO';
  String _payment = 'CASH';
  final _packageType = TextEditingController();
  final _notes = TextEditingController();

  List<dynamic> _quotes = [];
  List<dynamic> _neighborhoods = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadNeighborhoods('');
  }

  Future<void> _loadNeighborhoods(String q) async {
    try {
      final data = await Api.get('/places/neighborhoods?q=${Uri.encodeComponent(q)}');
      if (mounted) setState(() => _neighborhoods = (data as Map)['neighborhoods'] as List);
    } catch (_) {}
  }

  Future<void> _refreshQuote() async {
    if (_pickup == null || _dropoff == null) return;
    final data = await Api.post('/orders/quote', {
      'pickup': {'lat': _pickup!.latitude, 'lng': _pickup!.longitude},
      'dropoff': {'lat': _dropoff!.latitude, 'lng': _dropoff!.longitude},
    });
    if (mounted) setState(() => _quotes = (data as Map)['quotes'] as List);
  }

  Map<String, dynamic>? get _quote {
    for (final q in _quotes) {
      if (q['vehicleType'] == _vehicle) return Map<String, dynamic>.from(q as Map);
    }
    return null;
  }

  void _onTapMap(TapPosition _, LatLng point) {
    HapticFeedback.selectionClick();
    setState(() {
      if (_pickingPickup) {
        _pickup = point;
        if (_pickupLabel.isEmpty) {
          _pickupLabel =
              '${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)}';
        }
        _pickingPickup = false;
      } else {
        _dropoff = point;
        if (_dropoffLabel.isEmpty) {
          _dropoffLabel =
              '${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)}';
        }
      }
    });
    _refreshQuote();
  }

  void _useNeighborhood(Map<String, dynamic> n) {
    final point = LatLng((n['lat'] as num).toDouble(), (n['lng'] as num).toDouble());
    final label = '${n['nameAr']} / ${n['nameFr']}';
    setState(() {
      if (_pickingPickup) {
        _pickup = point;
        _pickupLabel = label;
        _pickingPickup = false;
      } else {
        _dropoff = point;
        _dropoffLabel = label;
      }
    });
    _map.move(point, 14);
    _refreshQuote();
  }

  Future<void> _confirm() async {
    if (_pickup == null || _dropoff == null || _busy) return;
    setState(() => _busy = true);
    try {
      final data = await Api.post('/orders', {
        'pickup': {'lat': _pickup!.latitude, 'lng': _pickup!.longitude, 'address': _pickupLabel},
        'dropoff': {'lat': _dropoff!.latitude, 'lng': _dropoff!.longitude, 'address': _dropoffLabel},
        'vehicleType': _vehicle,
        'paymentMethod': _payment,
        if (_packageType.text.isNotEmpty) 'packageType': _packageType.text,
        if (_notes.text.isNotEmpty) 'notes': _notes.text,
      });
      HapticFeedback.mediumImpact();
      if (!mounted) return;
      final order = Map<String, dynamic>.from((data as Map)['order'] as Map);
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => TrackingScreen(orderId: order['id'] as String)),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final quote = _quote;
    return Scaffold(
      appBar: AppBar(title: Text(l.t('newOrder'))),
      body: Column(
        children: [
          // ── Map picker ──
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _map,
                  options: MapOptions(
                    initialCenter: const LatLng(AppConfig.defaultLat, AppConfig.defaultLng),
                    initialZoom: 13,
                    onTap: _onTapMap,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: AppConfig.tileUrl,
                      userAgentPackageName: 'mr.meshily.customer',
                    ),
                    if (_pickup != null && _dropoff != null)
                      PolylineLayer(polylines: [
                        Polyline(
                          points: [_pickup!, _dropoff!],
                          color: MeshilyColors.primary,
                          strokeWidth: 4,
                        ),
                      ]),
                    MarkerLayer(markers: [
                      if (_pickup != null)
                        Marker(
                          point: _pickup!,
                          width: 40,
                          height: 40,
                          child: const Icon(Icons.trip_origin,
                              color: MeshilyColors.success, size: 32),
                        ),
                      if (_dropoff != null)
                        Marker(
                          point: _dropoff!,
                          width: 40,
                          height: 40,
                          child: const Icon(Icons.location_on,
                              color: MeshilyColors.danger, size: 36),
                        ),
                    ]),
                  ],
                ),
                Positioned(
                  top: 10,
                  left: 10,
                  right: 10,
                  child: Column(children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Column(children: [
                          _pointRow(Icons.trip_origin, MeshilyColors.success,
                              _pickupLabel.isEmpty ? l.t('pickup') : _pickupLabel,
                              selected: _pickingPickup, onTap: () {
                            setState(() => _pickingPickup = true);
                          }),
                          const Divider(height: 8),
                          _pointRow(Icons.location_on, MeshilyColors.danger,
                              _dropoffLabel.isEmpty ? l.t('dropoff') : _dropoffLabel,
                              selected: !_pickingPickup, onTap: () {
                            setState(() => _pickingPickup = false);
                          }),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 6),
                    // Neighborhood quick search
                    SizedBox(
                      height: 38,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: _neighborhoods
                            .map((n) => Padding(
                                  padding: const EdgeInsetsDirectional.only(end: 6),
                                  child: ActionChip(
                                    label: Text(n['nameAr'] as String,
                                        style: const TextStyle(fontSize: 12)),
                                    onPressed: () =>
                                        _useNeighborhood(Map<String, dynamic>.from(n as Map)),
                                  ),
                                ))
                            .toList(),
                      ),
                    ),
                  ]),
                ),
              ],
            ),
          ),
          // ── Options & quote ──
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Expanded(
                      child: _vehicleCard('MOTO', '🛵', l.t('moto'), l.t('motoDesc')),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _vehicleCard('TRUCK', '🚚', l.t('truck'), l.t('truckDesc')),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _payment,
                        items: [
                          DropdownMenuItem(value: 'CASH', child: Text(l.t('cash'))),
                          DropdownMenuItem(value: 'WALLET', child: Text(l.t('wallet'))),
                          const DropdownMenuItem(value: 'BANKILY', child: Text('Bankily')),
                          const DropdownMenuItem(value: 'MASRIVI', child: Text('Masrivi')),
                        ],
                        onChanged: (v) => setState(() => _payment = v ?? 'CASH'),
                        decoration: InputDecoration(labelText: l.t('payment')),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 10),
                  if (quote != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                              '${l.t('distance')}: ${quote['distanceKm']} ${l.t('km')} • ${quote['durationMin']} ${l.t('min')}'),
                          Text(
                            '${quote['price']} ${l.t('mru')}',
                            style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w800,
                                color: MeshilyColors.primary),
                          ),
                        ],
                      ),
                    ),
                  FilledButton(
                    onPressed:
                        (_pickup != null && _dropoff != null && !_busy) ? _confirm : null,
                    child: _busy
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : Text(l.t('confirmOrder')),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pointRow(IconData icon, Color color, String label,
      {required bool selected, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      child: Row(children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: 8),
        Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis)),
        if (selected)
          const Icon(Icons.touch_app, size: 18, color: MeshilyColors.primary),
      ]),
    );
  }

  Widget _vehicleCard(String value, String emoji, String title, String desc) {
    final selected = _vehicle == value;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() => _vehicle = value);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? MeshilyColors.primary : Colors.grey.shade300,
            width: selected ? 2 : 1,
          ),
          color: selected
              ? MeshilyColors.primary.withValues(alpha: 0.08)
              : Colors.transparent,
        ),
        child: Column(children: [
          Text(emoji, style: const TextStyle(fontSize: 26)),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          Text(desc,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: Theme.of(context).hintColor)),
        ]),
      ),
    );
  }
}
