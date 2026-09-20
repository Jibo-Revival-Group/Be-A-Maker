import Foundation

/// Owns the embedded Node.js engine. The NodeMobile xcframework provides the
/// `NodeMobile` module; keeping this boundary in one file makes runtime updates
/// independent from the UIKit shell.
final class NodeServerController {
    let port: UInt16 = 5173
    private(set) var isRunning = false

    var url: URL { URL(string: "http://127.0.0.1:\(port)")! }

    func start() {
        guard !isRunning else { return }
        let root = Bundle.main.url(forResource: "EmbeddedApp", withExtension: nil)!
        let server = root.appendingPathComponent("web/server.js").path

        // NodeMobileRuntime is the small Objective-C adapter included with the
        // Node.js for Mobile xcframework. It starts Node on a background thread
        // and does not fork a process (which iOS does not permit).
        NodeMobileRuntime.start(arguments: ["node", server], workingDirectory: root.path,
                                environment: ["PORT": String(port)])
        isRunning = true
    }

    func stop() {
        guard isRunning else { return }
        NodeMobileRuntime.stop()
        isRunning = false
    }
}
