import 'package:flutter/foundation.dart';
import '../models/models.dart';
import '../services/api_client.dart';

/// Holds the authenticated user and drives login/logout across the app.
class AuthState extends ChangeNotifier {
  final _api = ApiClient.instance;

  AppUser? user;
  bool bootstrapping = true;

  bool get isLoggedIn => user != null;

  /// Restore a session on app start.
  Future<void> bootstrap() async {
    await _api.loadToken();
    if (_api.hasToken) {
      try {
        final res = await _api.dio.get('/auth/me');
        user = AppUser.fromJson(res.data['user']);
      } catch (_) {
        await _api.clearToken();
      }
    }
    bootstrapping = false;
    notifyListeners();
  }

  Future<void> login(String identifier, String password) async {
    final res = await _api.dio.post('/auth/login', data: {
      'identifier': identifier,
      'password': password,
    });
    await _api.setToken(res.data['token']);
    user = AppUser.fromJson(res.data['user']);
    notifyListeners();
  }

  Future<void> logout() async {
    await _api.clearToken();
    user = null;
    notifyListeners();
  }

  /// Update the agent's presence (spec §37).
  Future<void> setStatus(String status) async {
    final res = await _api.dio.patch('/users/me/status', data: {'agentStatus': status});
    user = AppUser.fromJson(res.data['user']);
    notifyListeners();
  }
}
