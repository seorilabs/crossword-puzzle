#import "RCTNativeAppInfo.h"

@implementation RCTNativeAppInfo

// 태그 유래 실제 앱 버전(MARKETING_VERSION → CFBundleShortVersionString). JS 분석
// 레이어가 release_version 으로 싣는다. 값이 없거나 형식이 다르면 빈 문자열을 돌려
// JS 쪽 패키지 버전 폴백으로 떨어진다.
- (NSString *)getAppVersion
{
  id value = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
  if (![value isKindOfClass:[NSString class]]) {
    return @"";
  }

  return (NSString *)value;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppInfoSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"NativeAppInfo";
}

@end
