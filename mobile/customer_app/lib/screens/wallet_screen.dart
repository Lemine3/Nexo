import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/l10n.dart';
import '../core/theme.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  num _balance = 0;
  List<Map<String, dynamic>> _txs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await Api.get('/wallet');
    if (!mounted) return;
    setState(() {
      _balance = (data as Map)['balance'] as num;
      _txs = (data['transactions'] as List)
          .map((t) => Map<String, dynamic>.from(t as Map))
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('walletTitle'))),
      body: Column(children: [
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(22),
          width: double.infinity,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
                colors: [MeshilyColors.navy, Color(0xFF1E3A5F)]),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.t('balance'), style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 6),
            Text('$_balance ${l.t('mru')}',
                style: const TextStyle(
                    color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800)),
          ]),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _txs.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) {
              final t = _txs[i];
              final amount = t['amount'] as num;
              return ListTile(
                dense: true,
                title: Text(t['type'] as String),
                subtitle: Text((t['createdAt'] as String).substring(0, 16).replaceAll('T', ' ')),
                trailing: Text(
                  '${amount >= 0 ? '+' : ''}$amount',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: amount >= 0 ? MeshilyColors.success : MeshilyColors.danger,
                  ),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}
