import { Signal, inject, isSignal } from "@angular/core";
import { EmptyFeatureResult, patchState, SignalStoreFeature, SignalStoreFeatureResult, watchState, withComputed, withHooks, withMethods, withProps, withState } from "@ngrx/signals";
import { signalStore } from "@ngrx/signals";
import { InnerSignalStore, MethodsDictionary } from "@ngrx/signals/src/signal-store-models";


type WithNamedOutputSlice<
    Key extends string | number,
    Output extends SignalStoreFeatureResult,
    Slice extends keyof SignalStoreFeatureResult
> = {
        [x in keyof Output[Slice]as x extends string
        ? `${Key}${Capitalize<x>}`
        : x extends number
        ? `${Key}${x}`
        : never]: Output[Slice][x];
    };

type WithNamedOutputFeatureResult<
    Key extends string | number,
    Output extends SignalStoreFeatureResult
> = EmptyFeatureResult & {
    state: WithNamedOutputSlice<Key, Output, 'state'>;
    props: WithNamedOutputSlice<Key, Output, 'props'>;
    methods: WithNamedOutputSlice<Key, Output, 'methods'>;
};

export type WithNamedOutputStore<Key extends string | number,
    Output extends SignalStoreFeatureResult> = InnerSignalStore<
        WithNamedOutputFeatureResult<Key, Output>['state'],
        WithNamedOutputFeatureResult<Key, Output>['props'],
        WithNamedOutputFeatureResult<Key, Output>['methods']
    >

/**
 * @description
 * Allows pulling in feature properties, methods, etc... under a defined key
 *
 * @usageNotes
 * ```typescript
 * const withCommonFeature = () => signalStoreFeature(withState({commonField: 'Hello World!'}))
 *
 * signalStore(
 *   withCommonFeature(),
 *   withNamed('Area1', withCommonFeature),
 *   withNamed('Area2', withCommonFeature),
 *   withMethods((store) => ({
 *     log() {
 *       console.log(store.commonField())
 *       console.log(store.Area1CommonField())
 *       console.log(store.Area2CommonField())
 *     }
 *   }))
 * );
 * ```
 * @param key identifier to expose feature under
 * @param feature feature to wrap under the provided key
 */
export function withNamed<
    Key extends string | number,
    Input extends SignalStoreFeatureResult,
    Output extends SignalStoreFeatureResult
>(
    key: Key,
    featureFactory: () => SignalStoreFeature<Input, Output>
): SignalStoreFeature<Input, WithNamedOutputFeatureResult<Key, Output>> {
    return (store) => {
        /** Create and inject empty store, necessary without exposed export for getInitialStore or STATE_SOURCE symbol from ngrx library */
        const emptyStore = inject(signalStore({ providedIn: 'root' }, withState(() => ({})))) as Parameters<
            SignalStoreFeature<Input, Output>
        >[0]
        const innerStore = featureFactory()(emptyStore);

        const pStore = attachProps(key, innerStore)(store);
        const sStore = attachState(key, innerStore)(pStore);
        const mStore = attachMethods(key, innerStore)(sStore);
        const hStore = attachHooks(innerStore)(mStore);

        attachStateSyncWatchers(key, hStore, innerStore);

        return hStore as WithNamedOutputStore<Key, Output>;
    };
}

function getNamedKey(prefix: string | number, key: string) {
    return `${prefix}${key.charAt(0).toUpperCase()}${key.substring(1)}`;
}

function attachState<
    Key extends string | number,
    Input extends SignalStoreFeatureResult,
    Output extends SignalStoreFeatureResult
>(
    key: Key,
    innerStore: InnerSignalStore<
        Output['state'],
        Output['props'],
        Output['methods']
    >
) {
    return (
        store: InnerSignalStore<Input['state'], Input['props'], Input['methods']>
    ) => {
        const storeWithState = withState(() => {
            const namedState: any = {};
            Object.keys(innerStore.stateSignals).forEach((k) => {
                namedState[getNamedKey(key, k)] = (
                    innerStore.stateSignals[k as keyof typeof innerStore.stateSignals] as any
                )();
            });
            return namedState;
        })(store);

        return storeWithState;
    };
}

function attachMethods<
    Key extends string | number,
    Input extends SignalStoreFeatureResult,
    Output extends SignalStoreFeatureResult
>(
    key: Key,
    innerStore: InnerSignalStore<
        Output['state'],
        Output['props'],
        Output['methods']
    >
) {
    return (
        store: InnerSignalStore<Input['state'], Input['props'], Input['methods']>
    ) => {
        const storeWithMethods = withMethods(() => {
            const namedMethods: MethodsDictionary = {};
            Object.keys(innerStore.methods).forEach((k) => {
                namedMethods[getNamedKey(key, k)] = innerStore.methods[k];
            });
            return namedMethods;
        })(store);

        return storeWithMethods;
    };
}

function attachHooks<
    Key extends string | number,
    Input extends SignalStoreFeatureResult,
    Output extends SignalStoreFeatureResult
>(
    innerStore: InnerSignalStore<
        Output['state'],
        Output['props'],
        Output['methods']
    >
) {
    return (
        store: InnerSignalStore<Input['state'], Input['props'], Input['methods']>
    ) => {
        if (innerStore.hooks) {
            const storeWithHooks = withHooks(() => innerStore.hooks)(store);
            return storeWithHooks;
        }
        return store;
    };
}

function attachProps<
    Key extends string | number,
    Input extends SignalStoreFeatureResult,
    Output extends SignalStoreFeatureResult
>(
    key: Key,
    innerStore: InnerSignalStore<
        Output['state'],
        Output['props'],
        Output['methods']
    >
) {
    return (
        store: InnerSignalStore<Input['state'], Input['props'], Input['methods']>
    ) => {
        const storeWithProps = withProps(() => {
            const namedProps: any = {};
            Object.keys(innerStore.props).forEach((k) => {
                namedProps[getNamedKey(key, k)] = innerStore.props[
                    k as keyof typeof innerStore.props
                ] as any;
            });
            return namedProps;
        })(store);

        return storeWithProps;
    };
}

function attachStateSyncWatchers<
    Key extends string | number,
    Input extends SignalStoreFeatureResult,
    Output extends SignalStoreFeatureResult
>(
    key: Key,
    store: InnerSignalStore<Input['state'], Input['props'], Input['methods']>,
    innerStore: InnerSignalStore<
        Output['state'],
        Output['props'],
        Output['methods']
    >
) {
    /** Bubble state writes on inner store, back up to parent store */
    watchState(innerStore, (state) => {
        const namedState = Object.keys(state).reduce((acc, k) => {
            const namedKey = getNamedKey(key, k);
            const stateSignalMatch = (
                store.stateSignals as { [x: string]: Signal<unknown> }
            )[namedKey];
            if (
                stateSignalMatch &&
                stateSignalMatch() !== state[k as keyof typeof state]
            ) {
                acc[namedKey] = state[k as keyof typeof state];
            }
            return acc;
        }, {} as any);

        if (Object.keys({ ...namedState }).length > 0) {
            patchState(store, { ...namedState });
        }
    });

    const innerStateKeys = Object.keys(innerStore.stateSignals);
    const innerStateNamedKeysMap = innerStateKeys.reduce((acc, k) => {
        acc[getNamedKey(key, k)] = k;
        return acc;
    }, {} as any);

    /** Bubble state writes on outer store, back down to internal store */
    watchState(store, (state) => {
        const unNamedState = Object.keys(state).reduce((acc, k) => {
            const match = innerStateNamedKeysMap[k];
            if (match) {
                const innerStateSignalMatch = (
                    innerStore.stateSignals as { [x: string]: Signal<unknown> }
                )[match];
                if (
                    innerStateSignalMatch &&
                    innerStateSignalMatch() !== state[k as keyof typeof state]
                ) {
                    acc[match] = state[k as keyof typeof state];
                }
            }
            return acc;
        }, {} as any);
        if (Object.keys({ ...unNamedState }).length > 0) {
            patchState(innerStore, { ...unNamedState });
        }
    });
}
