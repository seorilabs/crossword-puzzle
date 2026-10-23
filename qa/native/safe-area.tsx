import React from "react";
import { View } from "react-native";
export const SafeAreaProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => <View style={{ flex: 1 }}>{children}</View>;
export function SafeAreaView({
  edges = ["top", "bottom", "left", "right"],
  style,
  ...props
}: React.ComponentProps<typeof View> & { edges?: string[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      style={[
        style,
        {
          paddingTop: edges.includes("top") ? insets.top : 0,
          paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
          paddingLeft: edges.includes("left") ? insets.left : 0,
          paddingRight: edges.includes("right") ? insets.right : 0,
        },
      ]}
    />
  );
}
export const useSafeAreaInsets = () => window.__crosswordQa.safeArea;
