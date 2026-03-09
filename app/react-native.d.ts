declare module "react-native" {
  import React from "react";

  export interface ViewStyle {
    [key: string]: any;
  }
  export interface TextStyle {
    [key: string]: any;
  }
  export interface ImageStyle {
    [key: string]: any;
  }

  type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

  export const StyleSheet: {
    create<T extends NamedStyles<T>>(styles: T): T;
  };

  export const AppRegistry: {
    registerComponent(appKey: string, componentProvider: () => React.ComponentType): void;
    runApplication(appKey: string, appParameters: { rootTag: HTMLElement | null }): void;
  };

  export const View: React.ComponentType<{
    style?: any;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const Text: React.ComponentType<{
    style?: any;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const TextInput: React.ComponentType<{
    style?: any;
    value?: string;
    onChangeText?: (text: string) => void;
    editable?: boolean;
    placeholder?: string;
    placeholderTextColor?: string;
    [key: string]: any;
  }>;

  export const ScrollView: React.ComponentType<{
    style?: any;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const TouchableOpacity: React.ComponentType<{
    style?: any;
    onPress?: () => void;
    children?: React.ReactNode;
    [key: string]: any;
  }>;

  export const FlatList: React.ComponentType<{
    data: any[];
    keyExtractor?: (item: any, index: number) => string;
    renderItem: (info: { item: any; index: number }) => React.ReactElement | null;
    ListEmptyComponent?: React.ReactElement | null;
    style?: any;
    [key: string]: any;
  }>;
}
