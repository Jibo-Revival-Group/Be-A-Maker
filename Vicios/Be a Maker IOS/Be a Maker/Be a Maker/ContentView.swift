import SwiftUI

struct ContentView: View {
    @State private var bridge = JiboBridge()
    @State private var isWebReady = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            BeMakerWebView(bridge: bridge) {
                withAnimation(.easeOut(duration: 0.2)) {
                    isWebReady = true
                }
            }
            .opacity(isWebReady ? 1 : 0)
            .ignoresSafeArea()
        }
    }
}

#Preview {
    ContentView()
}
