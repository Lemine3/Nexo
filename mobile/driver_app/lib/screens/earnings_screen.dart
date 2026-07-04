import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/l10n.dart';
import '../core/theme.dart';

/// Daily / weekly / monthly earnings + recent delivered trips.
class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  Map<String, dynamic>? _data;

  @override
  void initState() {
    super.initState();
    Api.get('/drivers/earnings').then((d) {
      if (mounted) setState(() => _data = Map<String, dynamic>.from(d as Map));
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: Text(l.t('earnings'))),
      body: data == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(padding: const EdgeInsets.all(16), children: [
              Row(children: [
                _statCard(l.t('today'), data['today'] as Map, l),
                const SizedBox(width: 10),
                _statCard(l.t('thisWeek'), data['week'] as Map, l),
                const SizedBox(width: 10),
                _statCard(l.t('thisMonth'), data['month'] as Map, l),
              ]),
              const SizedBox(height: 14),
              Card(
                color: MeshilyColors.navy,
                child: ListTile(
                  title: Text(l.t('walletBalance'),
                      style: const TextStyle(color: Colors.white70)),
                  trailing: Text(
                    '${data['walletBalance']} ${l.t('mru')}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              ...((data['recentTrips'] as List).map((t) {
                final trip = Map<String, dynamic>.from(t as Map);
                return Card(
                  child: ListTile(
                    dense: true,
                    title: Text(
                        '${trip['pickupAddress']} ← ${trip['dropoffAddress']}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    subtitle: Text(trip['code'] as String),
                    trailing: Text(
                      '+${trip['driverEarning']} ${l.t('mru')}',
                      style: const TextStyle(
                          color: MeshilyColors.success,
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                );
              })),
            ]),
    );
  }

  Widget _statCard(String label, Map data, L10n l) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            Text(label, style: TextStyle(fontSize: 12, color: Theme.of(context).hintColor)),
            const SizedBox(height: 6),
            Text('${data['amount']}',
                style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: MeshilyColors.primary)),
            Text('${data['trips']} ${l.t('trips')}',
                style: const TextStyle(fontSize: 11)),
          ]),
        ),
      ),
    );
  }
}
