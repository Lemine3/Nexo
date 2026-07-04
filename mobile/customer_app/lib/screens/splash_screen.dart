import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/l10n.dart';
import '../core/session.dart';
import '../core/theme.dart';
import 'auth/login_screen.dart';
import 'home_screen.dart';

/// Splash with a soft logo entrance animation, then routes to login/home.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();
  late final Animation<double> _scale =
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOutBack);

  @override
  void initState() {
    super.initState();
    _navigateWhenReady();
  }

  Future<void> _navigateWhenReady() async {
    final session = context.read<Session>();
    // Wait for both the animation and the session bootstrap.
    await Future.delayed(const Duration(milliseconds: 1400));
    while (!session.ready) {
      await Future.delayed(const Duration(milliseconds: 100));
    }
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) =>
            session.isLoggedIn ? const HomeScreen() : const LoginScreen(),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
        transitionDuration: const Duration(milliseconds: 450),
      ),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Scaffold(
      backgroundColor: MeshilyColors.navy,
      body: Center(
        child: ScaleTransition(
          scale: _scale,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(26),
                decoration: BoxDecoration(
                  color: MeshilyColors.primary,
                  borderRadius: BorderRadius.circular(30),
                ),
                child: const Icon(Icons.delivery_dining, size: 64, color: Colors.white),
              ),
              const SizedBox(height: 22),
              const Text(
                'Meshily',
                style: TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800),
              ),
              Text(
                l.t('appName'),
                style: const TextStyle(color: Colors.white70, fontSize: 17),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
