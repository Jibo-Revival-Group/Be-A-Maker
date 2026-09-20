import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var nodeServer: NodeServerController!

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        nodeServer = NodeServerController()
        nodeServer.start()

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController(server: nodeServer)
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func applicationWillTerminate(_ application: UIApplication) {
        nodeServer.stop()
    }
}
