import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/session.dart';
import '../../core/socket_service.dart';
import '../../core/theme.dart';

/// In-order chat between customer and driver (Socket.io room).
class ChatScreen extends StatefulWidget {
  final String orderId;
  const ChatScreen({super.key, required this.orderId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  List<Map<String, dynamic>> _messages = [];

  @override
  void initState() {
    super.initState();
    _load();
    final socket = SocketService.connect();
    socket.emitWithAck('order:subscribe', {'orderId': widget.orderId}, ack: (_) {});
    socket.on('chat:message', _onMessage);
  }

  void _onMessage(dynamic data) {
    if (!mounted || data is! Map || data['orderId'] != widget.orderId) return;
    setState(() => _messages.add(Map<String, dynamic>.from(data)));
    _scrollDown();
  }

  Future<void> _load() async {
    final data = await Api.get('/orders/${widget.orderId}/messages');
    if (!mounted) return;
    setState(() => _messages =
        ((data as Map)['messages'] as List).map((m) => Map<String, dynamic>.from(m as Map)).toList());
    _scrollDown();
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  void _send() {
    final text = _text.text.trim();
    if (text.isEmpty) return;
    SocketService.connect()
        .emitWithAck('chat:send', {'orderId': widget.orderId, 'text': text}, ack: (_) {});
    _text.clear();
  }

  @override
  void dispose() {
    SocketService.socket?.off('chat:message', _onMessage);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final myId = context.read<Session>().user?['id'];
    return Scaffold(
      appBar: AppBar(title: Text(l.t('chat'))),
      body: Column(children: [
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.all(12),
            itemCount: _messages.length,
            itemBuilder: (_, i) {
              final m = _messages[i];
              final mine = m['senderId'] == myId;
              return Align(
                alignment: mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: 3),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  constraints: const BoxConstraints(maxWidth: 280),
                  decoration: BoxDecoration(
                    color: mine ? MeshilyColors.primary : Theme.of(context).cardColor,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    m['text'] as String,
                    style: TextStyle(color: mine ? Colors.white : null),
                  ),
                ),
              );
            },
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _text,
                  decoration: InputDecoration(hintText: l.t('typeMessage')),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                style: IconButton.styleFrom(backgroundColor: MeshilyColors.primary),
                icon: const Icon(Icons.send, color: Colors.white),
                onPressed: _send,
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
