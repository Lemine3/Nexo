import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/session.dart';
import '../home_screen.dart';

/// Phone → OTP. New phones go through full driver registration:
/// vehicle type, plate number and document photos (license, ID, vehicle),
/// then the account waits for admin approval.
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
  final _plate = TextEditingController();

  String _vehicle = 'MOTO';
  final Map<String, XFile?> _docs = {'license': null, 'id': null, 'vehicle': null};

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
          resp = Map<String, dynamic>.from(
              await Api.post('/auth/register/request-otp', {'phone': _phone.text.trim()}) as Map);
          _registerMode = true;
        } else {
          rethrow;
        }
      }
      setState(() {
        _otpStage = true;
        _devCode = resp['devCode'] as String?;
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _pick(String key) async {
    final img = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600);
    if (img != null) setState(() => _docs[key] = img);
  }

  Future<void> _verify() async {
    setState(() { _busy = true; _error = null; });
    try {
      Map<String, dynamic> data;
      if (_registerMode) {
        data = Map<String, dynamic>.from(await Api.post('/auth/register/verify', {
          'phone': _phone.text.trim(),
          'code': _otp.text.trim(),
          'name': _name.text.trim(),
          'password': _password.text,
          'role': 'DRIVER',
          'driver': {'vehicleType': _vehicle, 'plateNumber': _plate.text.trim()},
        }) as Map);
        await context.read<Session>().onAuthenticated(data);
        // Upload documents after authentication, then attach them.
        final urls = <String, String>{};
        for (final e in _docs.entries) {
          if (e.value != null && File(e.value!.path).existsSync()) {
            urls[e.key] = await Api.uploadFile(e.value!.path);
          }
        }
        if (urls.isNotEmpty) {
          await Api.put('/drivers/me', {
            if (urls['license'] != null) 'licenseImageUrl': urls['license'],
            if (urls['id'] != null) 'idCardImageUrl': urls['id'],
            if (urls['vehicle'] != null) 'vehicleImageUrl': urls['vehicle'],
          });
        }
      } else {
        data = Map<String, dynamic>.from(await Api.post('/auth/login/otp/verify', {
          'phone': _phone.text.trim(),
          'code': _otp.text.trim(),
        }) as Map);
        await context.read<Session>().onAuthenticated(data);
      }
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
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const SizedBox(height: 30),
            Text(l.t('appName'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
            Text(l.t('tagline'),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, color: Theme.of(context).hintColor)),
            const SizedBox(height: 32),
            if (!_otpStage) ...[
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(labelText: l.t('phone')),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _requestOtp,
                child: Text(l.t('continueBtn')),
              ),
            ] else ...[
              Text('${l.t('otpSent')} ${_phone.text}', textAlign: TextAlign.center),
              if (_devCode != null)
                Text('DEV OTP: $_devCode',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.orange)),
              const SizedBox(height: 12),
              TextField(
                controller: _otp,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, letterSpacing: 8),
                decoration: InputDecoration(labelText: l.t('otpTitle'), counterText: ''),
              ),
              if (_registerMode) ...[
                const SizedBox(height: 8),
                TextField(controller: _name, decoration: InputDecoration(labelText: l.t('name'))),
                const SizedBox(height: 8),
                TextField(
                    controller: _password,
                    obscureText: true,
                    decoration: InputDecoration(labelText: l.t('password'))),
                const SizedBox(height: 14),
                Text(l.t('vehicleType'), style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                SegmentedButton<String>(
                  segments: [
                    ButtonSegment(value: 'MOTO', label: Text('🛵 ${l.t('moto')}')),
                    ButtonSegment(value: 'TRUCK', label: Text('🚚 ${l.t('truck')}')),
                  ],
                  selected: {_vehicle},
                  onSelectionChanged: (s) => setState(() => _vehicle = s.first),
                ),
                const SizedBox(height: 10),
                TextField(
                    controller: _plate,
                    decoration: InputDecoration(labelText: l.t('plateNumber'))),
                const SizedBox(height: 12),
                _docTile('license', l.t('licensePhoto'), l),
                _docTile('id', l.t('idPhoto'), l),
                _docTile('vehicle', l.t('vehiclePhoto'), l),
              ],
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _verify,
                child: _busy
                    ? const SizedBox(
                        width: 22, height: 22,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : Text(_registerMode ? l.t('createAccount') : l.t('verify')),
              ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!,
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
              ),
          ]),
        ),
      ),
    );
  }

  Widget _docTile(String key, String label, L10n l) {
    final picked = _docs[key] != null;
    return Card(
      child: ListTile(
        leading: Icon(picked ? Icons.check_circle : Icons.upload_file,
            color: picked ? Colors.green : null),
        title: Text(label),
        trailing: TextButton(onPressed: () => _pick(key), child: Text(l.t('pickPhoto'))),
      ),
    );
  }
}
