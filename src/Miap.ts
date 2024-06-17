import {
  LOG_LEVEL,
  MakePurchaseResult,
  Purchases,
} from "@revenuecat/purchases-capacitor";

type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];
const DeviceType = {
  ios: `ios`,
  android: `android`,
  web: `web`,
} as const;
export function miapStore<
  Products extends {
    [product: string]: {
      [PlatformId in Exclude<DeviceType, `web`>]?: string;
    };
  },
>(config: {
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
} {
  const deviceType = config.getDeviceType();
  let haveStartedSetup = false;
  const revenueCatSetUp = new Promise<void>((resolve) =>
    document.addEventListener(
      "deviceready",
      async () => {
        config.devLog?.(`deviceready triggered`);
        if (haveStartedSetup) return;
        haveStartedSetup = true;
        if (deviceType === DeviceType.web) {
          resolve();
          return null;
        }
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({
          apiKey: config.apiKeys[deviceType],
        });
        config.devLog?.(`About to start RevenueCat auth watcher.`);
        config.watchIapUserId((userId) => {
          try {
            config.devLog?.(`WorkspaceId: ${userId}`);
            if (exists(userId)) {
              config.devLog?.(`Logging into Revenue Cat as ${userId}.`);
              Purchases.logIn({ appUserID: userId }).catch(() => {
                console.warn(`Failed to log in to Revenue Cat.`);
                config.devLog?.(`Failed to log in to Revenue Cat.`);
              });
            } else {
              config.devLog?.(`Logging out of Revenue Cat.`);
              Purchases.isAnonymous().then((isAnonymous) => {
                if (isAnonymous) return;
                Purchases.logOut().catch(() => {
                  console.warn(`Failed to log out of Revenue Cat.`);
                  config.devLog?.(`Failed to log out of Revenue Cat.`);
                });
              });
            }
          } catch (e) {
            console.warn(e);
          }
        });
        resolve();
      },
      false,
    ),
  );
  console.log(`A: Initializing store.`);
  doNow(async () => {
    await revenueCatSetUp;
    console.log(`Initializing store.`);
  });
  return {
    goToSubscriptionManagement: async () => {
      await revenueCatSetUp;
      const customerInfo = (await Purchases.getCustomerInfo()).customerInfo;
      if (!exists(customerInfo.managementURL)) {
        console.warn(`No management URL found.`);
        return;
      }
      window.open(customerInfo.managementURL, `_blank`);
    },
    restorePurchases: async () => {
      await revenueCatSetUp;
      await Purchases.restorePurchases();
    },
    products: Object.fromEntries(
      Object.entries(config.products).map(([product, platformIds]) => [
        product,
        {
          async getLocalizedPrice() {
            if (deviceType === DeviceType.web) return `$12.99`;
            const productId = platformIds[deviceType];
            if (!exists(productId)) return undefined;
            await revenueCatSetUp;
            const productsResponse = (
              await Purchases.getProducts({
                productIdentifiers: [productId],
              })
            ).products;
            if (productsResponse.length === 0) return undefined;
            const product = productsResponse[0];
            return product.priceString;
          },
          // TODO: Sometimes the subscription fails if the user is already subscribed on another team.
          purchase: async () => {
            config.onPurchasePromptToggle?.(true);
            Purchases.getCustomerInfo().then((info) => {
              config.devLog?.(
                `Purchases: ${JSON.stringify(
                  info.customerInfo.allPurchasedProductIdentifiers,
                  null,
                  2,
                )}`,
              );
            });
            const purchaseResult: MakePurchaseResult | undefined = await doNow(
              async () => {
                config.devLog?.(`Attempting to purchase subscription...`);
                try {
                  if (deviceType === DeviceType.web) {
                    config.devLog?.(
                      `Product not available on platform web. Could not start purchase.`,
                    );
                    return;
                  }
                  const productId = platformIds[deviceType];
                  if (!exists(productId)) {
                    config.devLog?.(
                      `Product not available on platform ${deviceType}. Could not start purchase.`,
                    );
                    return;
                  }
                  await revenueCatSetUp;
                  const productsResponse = (
                    await Purchases.getProducts({
                      productIdentifiers: [productId],
                    })
                  ).products;
                  if (productsResponse.length === 0) {
                    config.devLog?.(`Product not found`);
                    return;
                  }
                  const product = productsResponse[0];
                  const purchaseResult = await Purchases.purchaseStoreProduct({
                    product,
                  });
                  config.onPurchaseAttempt?.();
                  config.devLog?.(`Purchase completed.`);
                  return purchaseResult;
                } catch (e) {
                  config.devLog?.(`Error: ${JSON.stringify(e, null, 2)}`);
                }
              },
            );
            config.onPurchasePromptToggle?.(false);
            return purchaseResult;
          },
        },
      ]),
    ),
  } as any;
}

function exists<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}
function doNow<T>(fn: () => T): T {
  return fn();
}
