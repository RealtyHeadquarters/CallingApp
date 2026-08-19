// Data models mirroring the backend API responses.

class AppUser {
  final String id;
  final String name;
  final String email;
  final String mobile;
  final String role;
  final String agentStatus;

  AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.mobile,
    required this.role,
    required this.agentStatus,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'],
        name: j['name'] ?? '',
        email: j['email'] ?? '',
        mobile: j['mobile'] ?? '',
        role: j['role'] ?? 'AGENT',
        agentStatus: j['agentStatus'] ?? 'OFFLINE',
      );
}

class CallStats {
  final int totalCalls;
  final int answeredCalls;
  final int unansweredCalls;
  final double answerRate;
  final String totalTalkTime;
  final String avgTalkTime;

  CallStats.fromJson(Map<String, dynamic> j)
      : totalCalls = j['totalCalls'] ?? 0,
        answeredCalls = j['answeredCalls'] ?? 0,
        unansweredCalls = j['unansweredCalls'] ?? 0,
        answerRate = (j['answerRate'] ?? 0).toDouble(),
        totalTalkTime = j['totalTalkTime'] ?? '00:00:00',
        avgTalkTime = j['avgTalkTime'] ?? '00:00:00';
}

class AgentDashboard {
  final CallStats kpis;
  final int followUpsToday;
  final int followUpsPending;

  AgentDashboard.fromJson(Map<String, dynamic> j)
      : kpis = CallStats.fromJson(j['kpis'] ?? {}),
        followUpsToday = (j['followUps']?['today']) ?? 0,
        followUpsPending = (j['followUps']?['pending']) ?? 0;
}

class Lead {
  final String id;
  final String leadId;
  final String name;
  final String mobile;
  final String? company;
  final String leadStatus;

  Lead.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        leadId = j['leadId'] ?? '',
        name = j['name'] ?? '',
        mobile = j['mobile'] ?? '',
        company = j['company'],
        leadStatus = j['leadStatus'] ?? 'NEW';
}

/// Result of a phone-number lookup (spec §7).
class LookupResult {
  final bool found;
  final String? clientId;
  final String? name;
  final String? company;
  final String? leadStatus;
  final String? lastRemark;
  final DateTime? nextFollowUp;

  LookupResult({
    required this.found,
    this.clientId,
    this.name,
    this.company,
    this.leadStatus,
    this.lastRemark,
    this.nextFollowUp,
  });

  factory LookupResult.fromJson(Map<String, dynamic> j) {
    if (j['found'] != true) return LookupResult(found: false);
    final c = j['client'] ?? {};
    final follow = c['nextFollowUp'];
    return LookupResult(
      found: true,
      clientId: c['id'],
      name: c['name'],
      company: c['company'],
      leadStatus: c['leadStatus'],
      lastRemark: c['lastCall']?['remark'],
      nextFollowUp: follow?['followupAt'] != null ? DateTime.tryParse(follow['followupAt']) : null,
    );
  }
}

class CallRecord {
  final String id;
  final String callId;
  final String phoneNumber;
  final String? clientName;
  final String? customerName;
  final String direction;
  final String? callStatus;
  final String? disposition;
  final String? remark;
  final int durationSeconds;
  final String durationFormatted;
  final DateTime createdAt;

  CallRecord.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        callId = j['callId'] ?? '',
        phoneNumber = j['phoneNumber'] ?? '',
        clientName = j['client']?['name'],
        customerName = j['customerName'],
        direction = j['direction'] ?? 'OUTGOING',
        callStatus = j['callStatus'],
        disposition = j['disposition'],
        remark = j['remark'],
        durationSeconds = j['durationSeconds'] ?? 0,
        durationFormatted = j['durationFormatted'] ?? '00:00:00',
        // Backend times are UTC — show them in the device's local timezone.
        createdAt = (DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now()).toLocal();
}

class NotificationItem {
  final String id;
  final String type;
  final String title;
  final String? body;
  final bool read;
  final DateTime createdAt;

  NotificationItem.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        type = j['type'] ?? '',
        title = j['title'] ?? '',
        body = j['body'],
        read = j['read'] ?? false,
        createdAt = (DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now()).toLocal();
}

class FollowUp {
  final String id;
  final String clientName;
  final String? note;
  final String followupType;
  final String status;
  final DateTime followupAt;

  FollowUp.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        clientName = j['client']?['name'] ?? '',
        note = j['note'],
        followupType = j['followupType'] ?? 'CALL',
        status = j['status'] ?? 'PENDING',
        followupAt = (DateTime.tryParse(j['followupAt'] ?? '') ?? DateTime.now()).toLocal();
}
