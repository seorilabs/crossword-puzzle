#import <Foundation/Foundation.h>
#import <GameKit/GameKit.h>
#import <NativeLeaderboardSpec/NativeLeaderboardSpec.h>

NS_ASSUME_NONNULL_BEGIN

@interface RCTNativeLeaderboard : NSObject <NativeLeaderboardSpec, GKGameCenterControllerDelegate>
@end

NS_ASSUME_NONNULL_END
