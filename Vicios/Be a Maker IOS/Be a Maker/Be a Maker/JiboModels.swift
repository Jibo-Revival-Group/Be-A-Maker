import Foundation

enum JiboConnectionState: Equatable {
    case disconnected
    case connecting(String)
    case connected(host: String, port: Int)
    case failed(String)

    var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }

    var title: String {
        switch self {
        case .disconnected:
            return "Disconnected"
        case .connecting(let host):
            return "Connecting to \(host)"
        case .connected(let host, let port):
            return "Connected to \(host):\(port)"
        case .failed(let message):
            return message
        }
    }
}

struct JiboCommand: Decodable {
    let type: String?
    let blockType: String?
    let blockID: String?
    let args: [JiboArgument]

    enum CodingKeys: String, CodingKey {
        case type
        case blockType = "block_type"
        case blockID = "block_id"
        case args
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decodeIfPresent(String.self, forKey: .type)
        blockType = try container.decodeIfPresent(String.self, forKey: .blockType)
        blockID = try container.decodeIfPresent(String.self, forKey: .blockID)
        if let decodedArgs = try? container.decodeIfPresent([JiboArgument].self, forKey: .args) {
            args = decodedArgs
        } else if let singleArg = try? container.decodeIfPresent(JiboArgument.self, forKey: .args) {
            args = [singleArg]
        } else {
            args = []
        }
    }

    var normalizedBlockType: String {
        let normalized = (blockType ?? type ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")

        switch normalized {
        case "look_at":
            return "lookat"
        case "look_at_3d":
            return "lookat3d"
        case "take_photo":
            return "takephoto"
        case "getconfig":
            return "get_config"
        case "setconfig":
            return "set_config"
        case "set_attention":
            return "setattention"
        case "fetch_asset":
            return "fetchasset"
        default:
            return normalized
        }
    }
}

enum JiboArgument: Decodable, CustomStringConvertible {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JiboArgument])
    case array([JiboArgument])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JiboArgument].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JiboArgument].self) {
            self = .object(value)
        } else {
            self = .null
        }
    }

    var description: String {
        switch self {
        case .string(let value): return value
        case .number(let value): return String(value)
        case .bool(let value): return value ? "true" : "false"
        case .object: return "[object]"
        case .array(let values): return values.map(\.description).joined(separator: ", ")
        case .null: return ""
        }
    }

    var doubleValue: Double {
        switch self {
        case .number(let value): return value
        case .string(let value): return Double(value) ?? 0
        case .bool(let value): return value ? 1 : 0
        case .object, .array, .null: return 0
        }
    }

    var jsonValue: Any {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            return value
        case .bool(let value):
            return value
        case .object(let values):
            return values.mapValues { $0.jsonValue }
        case .array(let values):
            return values.map { $0.jsonValue }
        case .null:
            return NSNull()
        }
    }
}

struct JiboStatus: Encodable {
    let connected: Bool
    let host: String?
    let port: Int?
}
