#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface DoneApp : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate>
@property NSWindow *window;
@property WKWebView *web;
@property NSTask *server;
@property NSFileHandle *log;
@property NSDictionary *settings;
@property NSDate *deadline;
@end

@implementation DoneApp
- (void)applicationDidFinishLaunching:(NSNotification *)note {
    NSData *data = [NSData dataWithContentsOfURL:[[NSBundle mainBundle] URLForResource:@"settings" withExtension:@"json"]];
    self.settings = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    self.web = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:[WKWebViewConfiguration new]];
    self.web.navigationDelegate = self; self.web.UIDelegate = self;
    self.web.allowsBackForwardNavigationGestures = YES;
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1440,950) styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"D.one Magazine"; self.window.minSize = NSMakeSize(960,640);
    self.window.contentView = self.web; self.window.releasedWhenClosed = NO;
    [self.window setFrameAutosaveName:@"DoneMagazineWindow"]; [self.window center];
    [self.window makeKeyAndOrderFront:nil]; [NSApp activateIgnoringOtherApps:YES];
    [self menu];
    [self.web loadHTMLString:@"<html><body style='background:#f5f3ef;font-family:system-ui;display:grid;place-items:center;height:90vh'><div><h1>D.one</h1><p>매거진 스튜디오를 열고 있습니다…</p></div></body></html>" baseURL:nil];
    self.deadline = [NSDate dateWithTimeIntervalSinceNow:60]; [self connect];
}
- (void)menu {
    NSMenu *menu = [NSMenu new]; NSMenuItem *item = [NSMenuItem new]; [menu addItem:item];
    NSMenu *application = [NSMenu new]; item.submenu = application;
    [application addItemWithTitle:@"D.one Magazine 종료" action:@selector(terminate:) keyEquivalent:@"q"];
    item = [NSMenuItem new]; [menu addItem:item]; NSMenu *edit = [[NSMenu alloc] initWithTitle:@"편집"]; item.submenu = edit;
    NSArray *entries = @[@[@"실행 취소",@"undo:",@"z"],@[@"잘라내기",@"cut:",@"x"],@[@"복사",@"copy:",@"c"],@[@"붙여넣기",@"paste:",@"v"],@[@"전체 선택",@"selectAll:",@"a"]];
    for (NSArray *entry in entries) [edit addItemWithTitle:entry[0] action:NSSelectorFromString(entry[1]) keyEquivalent:entry[2]];
    item = [NSMenuItem new]; [menu addItem:item]; NSMenu *view = [[NSMenu alloc] initWithTitle:@"보기"]; item.submenu = view;
    NSMenuItem *refresh = [view addItemWithTitle:@"새로고침" action:@selector(refresh:) keyEquivalent:@"r"]; refresh.target = self;
    NSApp.mainMenu = menu;
}
- (void)refresh:(id)sender { self.deadline = [NSDate dateWithTimeIntervalSinceNow:60]; [self connect]; }
- (void)showError:(NSString *)message {
    NSAlert *alert = [NSAlert new]; alert.messageText = @"D.one Magazine을 열지 못했습니다";
    alert.informativeText = message; [alert runModal];
}
- (BOOL)startServer {
    NSString *root = self.settings[@"projectRoot"], *node = self.settings[@"nodePath"];
    if (!root || !node) { [self showError:@"앱 설정을 읽지 못했습니다."]; return NO; }
    NSString *logs = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/D.one Magazine"];
    [[NSFileManager defaultManager] createDirectoryAtPath:logs withIntermediateDirectories:YES attributes:nil error:nil];
    NSString *path = [logs stringByAppendingPathComponent:@"server.log"];
    if (![[NSFileManager defaultManager] fileExistsAtPath:path]) [[NSFileManager defaultManager] createFileAtPath:path contents:nil attributes:nil];
    self.log = [NSFileHandle fileHandleForWritingAtPath:path]; [self.log seekToEndOfFile];
    NSTask *task = [NSTask new]; task.executableURL = [NSURL fileURLWithPath:node];
    task.arguments = @[@"server/index.js"]; task.currentDirectoryURL = [NSURL fileURLWithPath:root];
    NSMutableDictionary *env = [[[NSProcessInfo processInfo] environment] mutableCopy];
    env[@"NODE_ENV"] = @"production"; env[@"PATH"] = self.settings[@"path"]; env[@"CODEX_BIN"] = self.settings[@"codexPath"];
    task.environment = env; task.standardOutput = self.log; task.standardError = self.log;
    NSError *error; if (![task launchAndReturnError:&error]) { [self showError:error.localizedDescription]; return NO; }
    self.server = task;
    // Keep pending AI jobs alive when the desktop window is closed.
    return YES;
}
- (void)connect {
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:@"http://localhost:4317/api/status"]]; request.timeoutInterval = 3;
    [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSDictionary *json = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        BOOL ready = [(NSHTTPURLResponse *)response statusCode] == 200 && [json isKindOfClass:[NSDictionary class]] && json[@"codex"] && json[@"codex"] != [NSNull null];
        dispatch_async(dispatch_get_main_queue(), ^{
            if (ready) { [self.web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"http://localhost:4317/"]]]; return; }
            if (!self.server && ![self startServer]) return;
            if ([self.deadline timeIntervalSinceNow] < 0 || !self.server.running) { [self showError:@"로컬 서버를 시작하지 못했습니다. ~/Library/Logs/D.one Magazine/server.log를 확인해 주세요."]; return; }
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 700*NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [self connect]; });
        });
    }] resume];
}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag { [self.window makeKeyAndOrderFront:nil]; return YES; }
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return NO; }
- (void)webView:(WKWebView *)webView runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(NSArray<NSURL *> *))completionHandler {
    NSOpenPanel *panel = [NSOpenPanel new]; panel.canChooseDirectories = NO; panel.canChooseFiles = YES; panel.allowsMultipleSelection = parameters.allowsMultipleSelection;
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result){ completionHandler(result == NSModalResponseOK ? panel.URLs : nil); }];
}
- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features { if (action.request.URL) [[NSWorkspace sharedWorkspace] openURL:action.request.URL]; return nil; }
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    if (action.shouldPerformDownload) { decisionHandler(WKNavigationActionPolicyDownload); return; }
    NSURL *url = action.request.URL;
    if (([url.scheme isEqualToString:@"http"] || [url.scheme isEqualToString:@"https"]) && ![url.host isEqualToString:@"localhost"] && ![url.host isEqualToString:@"127.0.0.1"]) { [[NSWorkspace sharedWorkspace] openURL:url]; decisionHandler(WKNavigationActionPolicyCancel); return; }
    decisionHandler(WKNavigationActionPolicyAllow);
}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationResponse:(WKNavigationResponse *)response decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    BOOL attachment = NO;
    if ([response.response isKindOfClass:[NSHTTPURLResponse class]]) attachment = [[(NSHTTPURLResponse *)response.response valueForHTTPHeaderField:@"Content-Disposition"].lowercaseString containsString:@"attachment"];
    decisionHandler(!response.canShowMIMEType || attachment ? WKNavigationResponsePolicyDownload : WKNavigationResponsePolicyAllow);
}
- (void)webView:(WKWebView *)webView navigationAction:(WKNavigationAction *)action didBecomeDownload:(WKDownload *)download { download.delegate = self; }
- (void)webView:(WKWebView *)webView navigationResponse:(WKNavigationResponse *)response didBecomeDownload:(WKDownload *)download { download.delegate = self; }
- (void)download:(WKDownload *)download decideDestinationUsingResponse:(NSURLResponse *)response suggestedFilename:(NSString *)filename completionHandler:(void (^)(NSURL *))completionHandler {
    NSSavePanel *panel = [NSSavePanel new]; panel.nameFieldStringValue = filename;
    panel.directoryURL = [[[NSFileManager defaultManager] URLsForDirectory:NSDownloadsDirectory inDomains:NSUserDomainMask] firstObject];
    [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result){
        if (result != NSModalResponseOK || !panel.URL) { completionHandler(nil); return; }
        NSError *error;
        if ([[NSFileManager defaultManager] fileExistsAtPath:panel.URL.path] && ![[NSFileManager defaultManager] removeItemAtURL:panel.URL error:&error]) { [self showError:error.localizedDescription]; completionHandler(nil); return; }
        completionHandler(panel.URL);
    }];
}
- (void)download:(WKDownload *)download didFailWithError:(NSError *)error resumeData:(NSData *)resumeData { [self showError:error.localizedDescription]; }
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication]; [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        DoneApp *delegate = [DoneApp new]; app.delegate = delegate; [app run];
    }
    return 0;
}
