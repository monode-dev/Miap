"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.miapStore = void 0;
const purchases_capacitor_1 = require("@revenuecat/purchases-capacitor");
const DeviceType = {
    ios: `ios`,
    android: `android`,
    web: `web`,
};
function miapStore(config) {
    const deviceType = config.getDeviceType();
    let haveStartedSetup = false;
    const revenueCatSetUp = new Promise((resolve) => document.addEventListener("deviceready", async () => {
        config.devLog?.(`deviceready triggered`);
        if (haveStartedSetup)
            return;
        haveStartedSetup = true;
        if (deviceType === DeviceType.web) {
            resolve();
            return null;
        }
        await purchases_capacitor_1.Purchases.setLogLevel({ level: purchases_capacitor_1.LOG_LEVEL.DEBUG });
        await purchases_capacitor_1.Purchases.configure({
            apiKey: config.apiKeys[deviceType],
        });
        config.devLog?.(`About to start RevenueCat auth watcher.`);
        config.watchIapUserId((userId) => {
            try {
                config.devLog?.(`WorkspaceId: ${userId}`);
                if (exists(userId)) {
                    config.devLog?.(`Logging into Revenue Cat as ${userId}.`);
                    purchases_capacitor_1.Purchases.logIn({ appUserID: userId }).catch(() => {
                        console.warn(`Failed to log in to Revenue Cat.`);
                        config.devLog?.(`Failed to log in to Revenue Cat.`);
                    });
                }
                else {
                    config.devLog?.(`Logging out of Revenue Cat.`);
                    purchases_capacitor_1.Purchases.isAnonymous().then((isAnonymous) => {
                        if (isAnonymous)
                            return;
                        purchases_capacitor_1.Purchases.logOut().catch(() => {
                            console.warn(`Failed to log out of Revenue Cat.`);
                            config.devLog?.(`Failed to log out of Revenue Cat.`);
                        });
                    });
                }
            }
            catch (e) {
                console.warn(e);
            }
        });
        resolve();
    }, false));
    console.log(`A: Initializing store.`);
    doNow(async () => {
        await revenueCatSetUp;
        console.log(`Initializing store.`);
    });
    return {
        goToSubscriptionManagement: async () => {
            await revenueCatSetUp;
            const customerInfo = (await purchases_capacitor_1.Purchases.getCustomerInfo()).customerInfo;
            if (!exists(customerInfo.managementURL)) {
                console.warn(`No management URL found.`);
                return;
            }
            window.open(customerInfo.managementURL, `_blank`);
        },
        restorePurchases: async () => {
            await revenueCatSetUp;
            await purchases_capacitor_1.Purchases.restorePurchases();
        },
        products: Object.fromEntries(Object.entries(config.products).map(([product, platformIds]) => [
            product,
            {
                async getLocalizedPrice() {
                    if (deviceType === DeviceType.web)
                        return `$12.99`;
                    const productId = platformIds[deviceType];
                    if (!exists(productId))
                        return undefined;
                    await revenueCatSetUp;
                    const productsResponse = (await purchases_capacitor_1.Purchases.getProducts({
                        productIdentifiers: [productId],
                    })).products;
                    if (productsResponse.length === 0)
                        return undefined;
                    const product = productsResponse[0];
                    return product.priceString;
                },
                // TODO: Sometimes the subscription fails if the user is already subscribed on another team.
                purchase: async () => {
                    config.onPurchasePromptToggle?.(true);
                    purchases_capacitor_1.Purchases.getCustomerInfo().then((info) => {
                        config.devLog?.(`Purchases: ${JSON.stringify(info.customerInfo.allPurchasedProductIdentifiers, null, 2)}`);
                    });
                    const purchaseResult = await doNow(async () => {
                        config.devLog?.(`Attempting to purchase subscription...`);
                        try {
                            if (deviceType === DeviceType.web) {
                                config.devLog?.(`Product not available on platform web. Could not start purchase.`);
                                return;
                            }
                            const productId = platformIds[deviceType];
                            if (!exists(productId)) {
                                config.devLog?.(`Product not available on platform ${deviceType}. Could not start purchase.`);
                                return;
                            }
                            await revenueCatSetUp;
                            const productsResponse = (await purchases_capacitor_1.Purchases.getProducts({
                                productIdentifiers: [productId],
                            })).products;
                            if (productsResponse.length === 0) {
                                config.devLog?.(`Product not found`);
                                return;
                            }
                            const product = productsResponse[0];
                            const purchaseResult = await purchases_capacitor_1.Purchases.purchaseStoreProduct({
                                product,
                            });
                            config.onPurchaseAttempt?.();
                            config.devLog?.(`Purchase completed.`);
                            return purchaseResult;
                        }
                        catch (e) {
                            config.devLog?.(`Error: ${JSON.stringify(e, null, 2)}`);
                        }
                    });
                    config.onPurchasePromptToggle?.(false);
                    return purchaseResult;
                },
            },
        ])),
    };
}
exports.miapStore = miapStore;
function exists(value) {
    return value !== undefined && value !== null;
}
function doNow(fn) {
    return fn();
}
