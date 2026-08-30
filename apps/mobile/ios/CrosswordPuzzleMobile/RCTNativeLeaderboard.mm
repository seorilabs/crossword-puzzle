#import "RCTNativeLeaderboard.h"

#import <math.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

static NSString *const RCTLeaderboardIdentifierInfoKey = @"GameCenterLeaderboardIdentifier";

static NSString *RCTLeaderboardIdentifier(void)
{
  id value = [[NSBundle mainBundle] objectForInfoDictionaryKey:RCTLeaderboardIdentifierInfoKey];
  if (![value isKindOfClass:[NSString class]]) {
    return @"";
  }

  return [(NSString *)value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

static UIViewController *_Nullable RCTLeaderboardPresenter(void)
{
  UIViewController *controller = RCTPresentedViewController();
  return controller ?: RCTKeyWindow().rootViewController;
}

@interface RCTNativeLeaderboard ()
@property(nonatomic, strong, nullable) GKGameCenterViewController *activeController;
@end

@implementation RCTNativeLeaderboard

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  self = [super init];
  if (self != nil) {
    [self configureAuthentication];
  }
  return self;
}

- (void)configureAuthentication
{
  GKLocalPlayer.localPlayer.authenticateHandler = ^(UIViewController *_Nullable viewController,
                                                     NSError *_Nullable error) {
    if (viewController == nil || error != nil) {
      return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      UIViewController *presenter = RCTLeaderboardPresenter();
      if (presenter != nil && presenter.presentedViewController != viewController) {
        [presenter presentViewController:viewController animated:YES completion:nil];
      }
    });
  };
}

- (NSNumber *)isSupported
{
  return @(RCTLeaderboardIdentifier().length > 0);
}

- (void)isAuthenticated:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  if (RCTLeaderboardIdentifier().length == 0) {
    reject(@"leaderboard_not_configured", @"Game Center leaderboard is not configured", nil);
    return;
  }
  resolve(@(GKLocalPlayer.localPlayer.isAuthenticated));
}

- (void)submitScore:(double)score
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  NSString *leaderboardIdentifier = RCTLeaderboardIdentifier();
  if (leaderboardIdentifier.length == 0) {
    reject(@"leaderboard_not_configured", @"Game Center leaderboard is not configured", nil);
    return;
  }

  GKLocalPlayer *player = GKLocalPlayer.localPlayer;
  if (!player.isAuthenticated) {
    reject(@"leaderboard_auth_required", @"Game Center authentication is required", nil);
    return;
  }

  NSInteger normalizedScore = (NSInteger)llround(MAX(0.0, score));
  [GKLeaderboard submitScore:normalizedScore
                     context:0
                      player:player
              leaderboardIDs:@[ leaderboardIdentifier ]
           completionHandler:^(NSError *_Nullable error) {
             if (error != nil) {
               reject(@"leaderboard_submit_failed", error.localizedDescription, error);
               return;
             }
             resolve(nil);
           }];
}

- (void)openLeaderboard:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
  NSString *leaderboardIdentifier = RCTLeaderboardIdentifier();
  if (leaderboardIdentifier.length == 0) {
    reject(@"leaderboard_not_configured", @"Game Center leaderboard is not configured", nil);
    return;
  }
  if (!GKLocalPlayer.localPlayer.isAuthenticated) {
    reject(@"leaderboard_auth_required", @"Game Center authentication is required", nil);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presenter = RCTLeaderboardPresenter();
    if (presenter == nil) {
      reject(@"leaderboard_presenter_unavailable", @"Game Center presenter is unavailable", nil);
      return;
    }

    GKGameCenterViewController *controller =
        [[GKGameCenterViewController alloc] initWithLeaderboardID:leaderboardIdentifier
                                                     playerScope:GKLeaderboardPlayerScopeGlobal
                                                       timeScope:GKLeaderboardTimeScopeAllTime];
    controller.gameCenterDelegate = self;
    self.activeController = controller;
    [presenter presentViewController:controller
                            animated:YES
                          completion:^{
                            resolve(nil);
                          }];
  });
}

- (void)gameCenterViewControllerDidFinish:(GKGameCenterViewController *)gameCenterViewController
{
  [gameCenterViewController dismissViewControllerAnimated:YES
                                                completion:^{
                                                  self.activeController = nil;
                                                }];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeLeaderboardSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"NativeLeaderboard";
}

@end
