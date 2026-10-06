import Foundation
import Network

private final class ResumeGate: @unchecked Sendable {
    private let lock = NSLock()
    nonisolated(unsafe) private var didResume = false

    nonisolated func run(_ body: () -> Void) {
        lock.lock()
        defer { lock.unlock() }
        guard !didResume else { return }
        didResume = true
        body()
    }
}

@Observable
final class JiboBridge {
    private(set) var state: JiboConnectionState = .disconnected
    private(set) var lastCommand: String = "No commands yet"
    private(set) var commandLog: [String] = []

    private let romPorts = [7160, 8160]
    private var host: String?
    private var port: Int?
    private var webSocket: URLSessionWebSocketTask?
    private var sessionID = ""
    private var version = "1.0"
    private let appID = "ImmaLittleTeapot"
    var onTransactionComplete: ((String) -> Void)?

    var status: JiboStatus {
        if case .connected(let host, let port) = state {
            return JiboStatus(connected: true, host: host, port: port)
        }
        return JiboStatus(connected: false, host: host, port: port)
    }

    func connect(host rawHost: String) async {
        let cleanHost = rawHost.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isPlausibleHost(cleanHost) else {
            state = .failed("Enter a valid Jibo host or IP address.")
            return
        }

        state = .connecting(cleanHost)
        self.host = cleanHost
        self.port = nil

        for candidatePort in romPorts {
            if await canOpenTCP(host: cleanHost, port: candidatePort, timeout: 8),
               await openROMSession(host: cleanHost, port: candidatePort) {
                port = candidatePort
                state = .connected(host: cleanHost, port: candidatePort)
                log("Connected to \(cleanHost):\(candidatePort)")
                _ = await sendROMCommand(["Type": "SetAttention", "Mode": "Engaged"])
                return
            }
        }

        state = .failed("Couldn't reach ROM on \(cleanHost):7160 or :8160.")
    }

    func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        sessionID = ""
        version = "1.0"
        host = nil
        port = nil
        state = .disconnected
        log("Disconnected")
    }

    func handle(command: JiboCommand) async -> String? {
        let blockType = command.normalizedBlockType
        let arguments = command.args.map(\.description)
        let summary = blockType.isEmpty ? "Unknown command" : "\(blockType)(\(arguments.joined(separator: ", ")))"
        lastCommand = summary
        log(summary)

        guard state.isConnected else {
            log("Ignored command because no Jibo is connected")
            return nil
        }

        switch blockType {
        case "say", "listen", "lookat", "lookat3d", "takephoto", "get_config", "set_config", "cancel",
             "setattention", "display", "video", "fetchasset", "subscribe":
            return await send(commandType: blockType, arguments: command.args)
        default:
            if let rawCommand = legacyROMCommand(type: blockType, arguments: command.args) {
                return await sendROMCommand(rawCommand)
            } else {
                log("Unsupported Scratch command: \(blockType)")
                return nil
            }
        }
    }

    func showImageDataURL(_ dataURL: String) async throws {
        guard state.isConnected else {
            throw URLError(.notConnectedToInternet)
        }
        let name = "bam-face-\(Int(Date().timeIntervalSince1970))"
        _ = await sendROMCommand([
            "Type": "Display",
            "View": [
                "Type": "Image",
                "Name": name,
                "Image": ["src": dataURL, "name": name, "set": ""]
            ]
        ])
        log("Sent face image to Jibo display")
    }

    func clearFace() async throws {
        guard state.isConnected else {
            throw URLError(.notConnectedToInternet)
        }
        _ = await sendROMCommand([
            "Type": "Display",
            "View": ["Type": "Eye", "Name": "default"]
        ])
        log("Requested Jibo eye screen")
    }

    private func openROMSession(host: String, port: Int) async -> Bool {
        disconnectTransportOnly()

        do {
            try await postACO(host: host, port: port)
            guard let url = URL(string: "ws://\(host):\(port)") else { return false }
            let task = URLSession.shared.webSocketTask(with: url)
            webSocket = task
            task.resume()
            _ = await sendRawROMCommand(["Type": "StartSession"], allowEmptySession: true)
            return await waitForSessionID(timeout: 6)
        } catch {
            log("ROM session failed on :\(port): \(error.localizedDescription)")
            disconnectTransportOnly()
            return false
        }
    }

    private func disconnectTransportOnly() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        sessionID = ""
        version = "1.0"
    }

    private func postACO(host: String, port: Int) async throws {
        guard let url = URL(string: "http://\(host):\(port)/request") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 8
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "aco": [
                "version": "1.0",
                "sourceId": appID,
                "commandSet": [
                    "StartSession", "GetConfig", "SetConfig", "Cancel",
                    "SetAttention", "Say", "Listen", "LookAt",
                    "TakePhoto", "Video", "Display", "FetchAsset", "Subscribe"
                ],
                "streamSet": ["Entity", "Motion", "HeadTouch", "ScreenGesture", "Speech", "HotWord"],
                "keepAliveTimeout": 10000,
                "recoveryTimeout": 20000,
                "remoteConfig": [
                    "hideVisualCue": false,
                    "inactivityTimeout": 3_600_000
                ]
            ]
        ])
        _ = try await URLSession.shared.data(for: request)
    }

    private func waitForSessionID(timeout: TimeInterval) async -> Bool {
        guard let webSocket else { return false }
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            do {
                let message = try await webSocket.receive()
                let text: String
                switch message {
                case .string(let value):
                    text = value
                case .data(let data):
                    text = String(decoding: data, as: UTF8.self)
                @unknown default:
                    continue
                }

                guard let data = text.data(using: .utf8),
                      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    continue
                }

                if let response = object["Response"] as? [String: Any],
                   let body = response["ResponseBody"] as? [String: Any],
                   let id = body["SessionID"] as? String {
                    sessionID = id
                    version = body["Version"] as? String ?? "1.0"
                    startReceiveLoop()
                    return true
                }
            } catch {
                return false
            }
        }

        return false
    }

    private func startReceiveLoop() {
        guard let webSocket else { return }
        Task { [weak self, weak webSocket] in
            while let self, let webSocket {
                do {
                    let message = try await webSocket.receive()
                    let text: String
                    switch message {
                    case .string(let value):
                        text = value
                    case .data(let data):
                        text = String(decoding: data, as: UTF8.self)
                    @unknown default:
                        continue
                    }

                    guard let data = text.data(using: .utf8),
                          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                          let transactionID = self.transactionID(in: object) else {
                        continue
                    }

                    await MainActor.run {
                        self.onTransactionComplete?(transactionID)
                    }
                } catch {
                    await MainActor.run {
                        if self.state.isConnected {
                            self.state = .failed("Jibo connection closed.")
                        }
                    }
                    break
                }
            }
        }
    }

    private func transactionID(in object: [String: Any]) -> String? {
        if let header = object["ClientHeader"] as? [String: Any],
           let transactionID = header["TransactionID"] as? String {
            return transactionID
        }

        if let response = object["Response"] as? [String: Any] {
            if let header = response["ClientHeader"] as? [String: Any],
               let transactionID = header["TransactionID"] as? String {
                return transactionID
            }
            if let header = response["ResponseHeader"] as? [String: Any],
               let transactionID = header["TransactionID"] as? String {
                return transactionID
            }
        }

        return nil
    }

    private func send(commandType: String, arguments: [JiboArgument]) async -> String? {
        switch commandType {
        case "say":
            return await sendROMCommand(["Type": "Say", "ESML": arguments.first?.description.decodingXMLEntities ?? ""])
        case "listen":
            return await sendROMCommand([
                "Type": "Listen",
                "MaxSpeechTimeout": 15000,
                "MaxNoSpeechTimeout": 8000,
                "LanguageCode": "en-US"
            ])
        case "lookat":
            return await sendROMCommand([
                "Type": "LookAt",
                "LookAtTarget": ["Angle": [arguments.angleRadians(at: 0), arguments.angleRadians(at: 1)]],
                "TrackFlag": false,
                "LevelHeadFlag": false
            ])
        case "lookat3d":
            return await sendROMCommand([
                "Type": "LookAt",
                "LookAtTarget": ["Position": [arguments.value(at: 0) * 1000, arguments.value(at: 1) * 1000, arguments.value(at: 2) * 1000]],
                "TrackFlag": false,
                "LevelHeadFlag": false
            ])
        case "takephoto":
            return await sendROMCommand(["Type": "TakePhoto", "Camera": "right", "Resolution": "highRes", "Distortion": false])
        case "get_config":
            return await sendROMCommand(["Type": "GetConfig"])
        case "set_config":
            return await sendROMCommand(["Type": "SetConfig", "Options": ["Mixer": max(0.1, min(1, arguments.value(at: 0, fallback: 0.8))) ]])
        case "cancel":
            return await sendROMCommand(["Type": "Cancel", "ID": arguments.first?.description ?? ""])
        case "setattention":
            return await sendROMCommand(["Type": "SetAttention", "Mode": arguments.first?.description ?? "Engaged"])
        case "display":
            return await sendROMCommand(legacyROMCommand(type: "display", arguments: arguments) ?? ["Type": "Display"])
        case "video":
            return await sendROMCommand(legacyROMCommand(type: "video", arguments: arguments) ?? ["Type": "Video"])
        case "fetchasset":
            return await sendROMCommand(legacyROMCommand(type: "fetchasset", arguments: arguments) ?? ["Type": "FetchAsset"])
        case "subscribe":
            return await sendROMCommand(legacyROMCommand(type: "subscribe", arguments: arguments) ?? ["Type": "Subscribe"])
        default:
            return nil
        }
    }

    private func legacyROMCommand(type: String, arguments: [JiboArgument]) -> [String: Any]? {
        let romType = romCommandType(for: type)
        if case .object(let object)? = arguments.first {
            var command = object.mapValues { $0.jsonValue }
            if command["Type"] == nil {
                command["Type"] = romType
            }
            return command
        }
        return nil
    }

    private func romCommandType(for type: String) -> String {
        switch type {
        case "lookat", "lookat3d":
            return "LookAt"
        case "takephoto":
            return "TakePhoto"
        case "get_config":
            return "GetConfig"
        case "set_config":
            return "SetConfig"
        case "setattention":
            return "SetAttention"
        case "fetchasset":
            return "FetchAsset"
        default:
            return type
                .split(separator: "_")
                .map { $0.prefix(1).uppercased() + $0.dropFirst() }
                .joined()
        }
    }

    private func sendROMCommand(_ command: [String: Any]) async -> String? {
        await sendRawROMCommand(command, allowEmptySession: false)
    }

    private func sendRawROMCommand(_ command: [String: Any], allowEmptySession: Bool) async -> String? {
        guard let webSocket else {
            log("ROM socket is not open")
            return nil
        }
        guard allowEmptySession || !sessionID.isEmpty else {
            log("ROM session is not ready")
            return nil
        }

        do {
            let transactionID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
            let frame: [String: Any] = [
                "ClientHeader": [
                    "TransactionID": transactionID,
                    "SessionID": sessionID,
                    "AppID": appID,
                    "Credentials": "",
                    "Version": version
                ],
                "Command": command
            ]
            let data = try JSONSerialization.data(withJSONObject: frame)
            let text = String(decoding: data, as: UTF8.self)
            try await webSocket.send(.string(text))
            return transactionID
        } catch {
            log("ROM send failed: \(error.localizedDescription)")
            return nil
        }
    }

    private func log(_ message: String) {
        commandLog.insert(message, at: 0)
        if commandLog.count > 20 {
            commandLog.removeLast(commandLog.count - 20)
        }
    }

    private func isPlausibleHost(_ host: String) -> Bool {
        guard !host.isEmpty, host.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else {
            return false
        }

        if host == "localhost" { return true }

        let parts = host.split(separator: ".")
        if parts.count == 4, parts.allSatisfy({ Int($0).map { (0...255).contains($0) } ?? false }) {
            return true
        }

        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-")
        return host.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    private func canOpenTCP(host: String, port: Int, timeout: TimeInterval) async -> Bool {
        await withCheckedContinuation { continuation in
            let connection = NWConnection(
                host: NWEndpoint.Host(host),
                port: NWEndpoint.Port(integerLiteral: NWEndpoint.Port.IntegerLiteralType(port)),
                using: .tcp
            )
            let queue = DispatchQueue(label: "JiboBridge.tcpCheck.\(port)")
            let gate = ResumeGate()

            let finish: @Sendable (Bool) -> Void = { value in
                gate.run {
                    connection.cancel()
                    continuation.resume(returning: value)
                }
            }

            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    finish(true)
                case .failed, .cancelled:
                    finish(false)
                case .setup, .waiting, .preparing:
                    break
                @unknown default:
                    finish(false)
                }
            }

            queue.asyncAfter(deadline: .now() + timeout) {
                finish(false)
            }
            connection.start(queue: queue)
        }
    }
}

private extension String {
    var decodingXMLEntities: String {
        replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#34;", with: "\"")
            .replacingOccurrences(of: "&apos;", with: "'")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&amp;", with: "&")
    }
}

private extension Array where Element == JiboArgument {
    func value(at index: Int, fallback: Double = 0) -> Double {
        guard indices.contains(index) else { return fallback }
        return self[index].doubleValue
    }

    func angleRadians(at index: Int, fallback: Double = 0) -> Double {
        let value = self.value(at: index, fallback: fallback)
        return abs(value) > (.pi * 2 + 0.001) ? value * .pi / 180 : value
    }
}
