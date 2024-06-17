type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];
declare const DeviceType: {
    readonly ios: "ios";
    readonly android: "android";
    readonly web: "web";
};
export declare function miapStore<Products extends {
    [product: string]: {
        [PlatformId in Exclude<DeviceType, `web`>]?: string;
    };
}>(config: {
    watchIapUserId: (watch: (userId: string | undefined) => void) => void;
    getDeviceType: () => DeviceType;
    apiKeys: {
        [DeviceType.ios]: string;
        [DeviceType.android]: string;
    };
    products: Products;
    devLog?: (msg: string) => void;
    onPurchasePromptToggle?: (isShowing: boolean) => void;
    onPurchaseAttempt?: () => void;
}): {
    goToSubscriptionManagement(): Promise<void>;
    restorePurchases(): Promise<void>;
    products: {
        [Product in keyof Products]: {
            getLocalizedPrice(): Promise<string | undefined>;
            purchase(): Promise<void>;
        };
    };
};
export {};
