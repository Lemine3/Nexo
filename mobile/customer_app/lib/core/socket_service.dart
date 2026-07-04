import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api.dart';
import 'config.dart';

/// Single shared Socket.io connection (JWT-authenticated).
class SocketService {
  static io.Socket? _socket;

  static io.Socket connect() {
    if (_socket != null && _socket!.connected) return _socket!;
    _socket?.dispose();
    _socket = io.io(
      AppConfig.apiBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': Api.accessToken})
          .enableReconnection()
          .build(),
    );
    return _socket!;
  }

  static io.Socket? get socket => _socket;

  static void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
