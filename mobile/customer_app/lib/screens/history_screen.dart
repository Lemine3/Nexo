import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/l10n.dart';
import '../core/theme.dart';
import 'order/tracking_screen.dart';

/// Past orders + one-tap reorder.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<Map<String, dynamic>>? _orders;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await Api.get('/orders');
    if (!mounted) return;
    setState(() => _orders =
        ((data as Map)['orders'] as List).map((o) => Map<String, dynamic>.from(o as Map)).toList());
  }

  static const _statusColor = {
    'DELIVERED': MeshilyColors.success,
    'CANCELLED': MeshilyColors.danger,
  };

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final orders = _orders;
    return Scaffold(
      appBar: AppBar(title: Text(l.t('history'))),
      body: orders == null
          ? ListView(
              padding: const EdgeInsets.all(14),
              children: List.generate(
                5,
                (_) => Card(
                  child: Container(
                    height: 84,
                    padding: const EdgeInsets.all(14),
                    child: const LinearProgressIndicator(minHeight: 6),
                  ),
                ),
              ),
            )
          : orders.isEmpty
              ? Center(child: Text(l.t('noOrders')))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: orders.length,
                    itemBuilder: (_, i) {
                      final o = orders[i];
                      final active = ![
                        'DELIVERED', 'CANCELLED'
                      ].contains(o['status']);
                      return Card(
                        child: ListTile(
                          onTap: active
                              ? () => Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                      builder: (_) =>
                                          TrackingScreen(orderId: o['id'] as String)))
                              : null,
                          title: Text('${o['pickupAddress']} ← ${o['dropoffAddress']}',
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                              '${o['code']} • ${o['price']} ${l.t('mru')} • ${(o['createdAt'] as String).substring(0, 10)}'),
                          leading: Text(o['vehicleType'] == 'MOTO' ? '🛵' : '🚚',
                              style: const TextStyle(fontSize: 26)),
                          trailing: active
                              ? const Icon(Icons.chevron_left)
                              : TextButton(
                                  onPressed: () async {
                                    final data = await Api.post('/orders/${o['id']}/reorder');
                                    if (!context.mounted) return;
                                    final order = Map<String, dynamic>.from(
                                        (data as Map)['order'] as Map);
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                          builder: (_) => TrackingScreen(
                                              orderId: order['id'] as String)),
                                    );
                                  },
                                  child: Text(l.t('reorder')),
                                ),
                          iconColor: _statusColor[o['status']],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
