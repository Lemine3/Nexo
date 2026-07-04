import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/l10n.dart';
import '../core/theme.dart';

/// Request a payout of wallet earnings; admin approves & pays.
class WithdrawalsScreen extends StatefulWidget {
  const WithdrawalsScreen({super.key});

  @override
  State<WithdrawalsScreen> createState() => _WithdrawalsScreenState();
}

class _WithdrawalsScreenState extends State<WithdrawalsScreen> {
  final _amount = TextEditingController();
  final _account = TextEditingController();
  String _method = 'BANKILY';
  List<Map<String, dynamic>> _rows = [];
  bool _busy = false;

  static const _statusColor = {
    'PENDING': Colors.orange,
    'APPROVED': Colors.blue,
    'PAID': MeshilyColors.success,
    'REJECTED': MeshilyColors.danger,
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await Api.get('/drivers/withdrawals');
    if (!mounted) return;
    setState(() => _rows = ((data as Map)['withdrawals'] as List)
        .map((w) => Map<String, dynamic>.from(w as Map))
        .toList());
  }

  Future<void> _submit() async {
    final amount = num.tryParse(_amount.text);
    if (amount == null || amount <= 0 || _account.text.length < 4) return;
    setState(() => _busy = true);
    try {
      await Api.post('/drivers/withdrawals', {
        'amount': amount,
        'method': _method,
        'accountNumber': _account.text.trim(),
      });
      _amount.clear();
      await _load();
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
    return Scaffold(
      appBar: AppBar(title: Text(l.t('withdrawals'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(children: [
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration:
                    InputDecoration(labelText: '${l.t('amount')} (${l.t('mru')})'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _method,
                items: const [
                  DropdownMenuItem(value: 'BANKILY', child: Text('Bankily')),
                  DropdownMenuItem(value: 'MASRIVI', child: Text('Masrivi')),
                  DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                ],
                onChanged: (v) => setState(() => _method = v ?? 'BANKILY'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _account,
                decoration: InputDecoration(labelText: l.t('accountNumber')),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: Text(l.t('submitRequest')),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 10),
        ..._rows.map((w) => Card(
              child: ListTile(
                title: Text('${w['amount']} ${l.t('mru')} — ${w['method']}'),
                subtitle: Text((w['createdAt'] as String).substring(0, 10)),
                trailing: Text(
                  w['status'] as String,
                  style: TextStyle(
                      color: _statusColor[w['status']],
                      fontWeight: FontWeight.w700),
                ),
              ),
            )),
      ]),
    );
  }
}
