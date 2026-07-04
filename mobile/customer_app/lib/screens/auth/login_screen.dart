import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/session.dart';
import '../home_screen.dart';

/// Phone → OTP flow. If the phone is unknown, the flow becomes registration
/// (name + password collected together with the OTP).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController(text: '+222');
  final _otp = TextEditingController();
  final _name = TextEditingController();
  final _password = TextEditingController();

  bool _busy = false;
  bool _otpStage = false;
  bool _registerMode = false;
  String? _error;
  String? _devCode;

  Future<void> _requestOtp() async {
    setState(() { _busy = true; _error = null; });
    try {
      Map<String, dynamic> resp;
      try {
        resp = Map<String, dynamic>.from(
            await Api.post('/auth/login/otp/request', {'phone': _phone.text.trim()}) as Map);
        _registerMode = false;
      } on ApiException catch (e) {
        if (e.status == 404) {
          // New user → registration OTP.
          resp = Map<String, dynamic>.from(
              await Api.post('/auth/register/request-otp', {'phone': _phone.text.trim()}) as Map);
          _registerMode = true;
        } else {
          rethrow;
        }
      }
      setState(() {
        _otpStage = true;
        _devCode = resp['devCode'] as String?; // shown in dev builds only
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() { _busy = true; _error = null; });
    try {
      final data = _registerMode
          ? await Api.post('/auth/register/verify', {
              'phone': _phone.text.trim(),
              'code': _otp.text.trim(),
              'name': _name.text.trim(),
              'password': _password.text,
            })
          : await Api.post('/auth/login/otp/verify', {
              'phone': _phone.text.trim(),
              'code': _otp.text.trim(),
            });
      if (!mounted) return;
      await context.read<Session>().onAuthenticated(Map<String, dynamic>.from(data as Map));
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
        (_) => false,
      );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),
              Text(l.t('appName'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
              Text(l.t('tagline'),
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: Theme.of(context).hintColor)),
              const SizedBox(height: 40),
              if (!_otpStage) ...[
                TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(labelText: l.t('phone')),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _busy ? null : _requestOtp,
                  child: _busy
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : Text(l.t('continueBtn')),
                ),
              ] else ...[
                Text('${l.t('otpSent')} ${_phone.text}', textAlign: TextAlign.center),
                if (_devCode != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('DEV OTP: $_devCode',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.orange)),
                  ),
                const SizedBox(height: 16),
                TextField(
                  controller: _otp,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 24, letterSpacing: 10),
                  decoration: InputDecoration(labelText: l.t('otpTitle'), counterText: ''),
                ),
                if (_registerMode) ...[
                  const SizedBox(height: 10),
                  TextField(controller: _name, decoration: InputDecoration(labelText: l.t('name'))),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    decoration: InputDecoration(labelText: l.t('password')),
                  ),
                ],
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: _busy ? null : _verify,
                  child: Text(_registerMode ? l.t('createAccount') : l.t('verify')),
                ),
                TextButton(
                  onPressed: () => setState(() => _otpStage = false),
                  child: Text(l.t('phone')),
                ),
              ],
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(_error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.red)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
