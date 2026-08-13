import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'state/auth_state.dart';
import 'theme/app_theme.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthState()..bootstrap(),
      child: const CallingApp(),
    ),
  );
}

class CallingApp extends StatelessWidget {
  const CallingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CallingApp',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: Consumer<AuthState>(
        builder: (context, auth, _) {
          if (auth.bootstrapping) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return auth.isLoggedIn ? const HomeScreen() : const LoginScreen();
        },
      ),
    );
  }
}
