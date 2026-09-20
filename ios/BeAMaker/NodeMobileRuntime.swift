import Foundation

/// Adapter expected by the Swift shell. Implement this class in the NodeMobile
/// Objective-C bridge shipped with your selected NodeMobile xcframework.
///
/// The adapter must call the framework's in-process Node start/stop functions;
/// do not replace it with Process/NSTask because iOS apps cannot launch child
/// processes. Keeping the API tiny also makes it straightforward to update when
/// a newer NodeMobile SDK changes its C API.
final class NodeMobileRuntime {
    static func start(arguments: [String], workingDirectory: String, environment: [String: String]) {
        precondition(!arguments.isEmpty)
        // The generated Xcode target supplies the implementation through the
        // NodeMobile bridge module. This fallback gives a clear failure in an
        // incorrectly configured build instead of silently showing a blank view.
        #if DEBUG
        print("NodeMobile start: \(arguments.joined(separator: " ")) cwd=\(workingDirectory)")
        #endif
        NodeMobileBridge.start(arguments: arguments, workingDirectory: workingDirectory, environment: environment)
    }

    static func stop() { NodeMobileBridge.stop() }
}

#if canImport(NodeMobileBridge)
import NodeMobileBridge
#else
private enum NodeMobileBridge {
    static func start(arguments: [String], workingDirectory: String, environment: [String: String]) {
        fatalError("Add the NodeMobileBridge/NodeMobile xcframework to the BeAMaker target")
    }
    static func stop() {}
}
#endif
