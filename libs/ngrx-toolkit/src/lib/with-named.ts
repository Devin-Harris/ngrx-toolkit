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
 *   withNamed('Area1', withCommonFeature()),
 *   withNamed('Area2', withCommonFeature()),
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
        const emptyStore = inject(signalStore({ providedIn: 'root' }, withState(() => ({}))))
        const innerStore = featureFactory()(
            emptyStore as Parameters<
                SignalStoreFeature<Input, Output>
            >[0]
        );

        const pStore = attachProps(key, innerStore)(store);
        const sStore = attachState(key, innerStore)(pStore);
        const mStore = attachMethods(key, innerStore)(sStore);
        const hStore = attachHooks(key, innerStore)(mStore);

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
        type InnerStoreStateSignalKeyType = keyof typeof innerStore.stateSignals;
        const innerStoreNamedKeyMap = {} as {
            [x in InnerStoreStateSignalKeyType]: string;
        };

        const storeWithState = withState(() => {
            const namedState: any = {};
            Object.keys(innerStore.stateSignals).forEach((k) => {
                const namedKey = getNamedKey(key, k);
                innerStoreNamedKeyMap[k as InnerStoreStateSignalKeyType] = namedKey;
                namedState[namedKey] = (
                    innerStore.stateSignals[k as InnerStoreStateSignalKeyType] as any
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
        /** Add props, state, and methods under provided key */
        const { nonSignalProps, signalProps } = buildPropsInformation(
            innerStore.props
        );

        const storeWithProps = withProps(() => {
            const namedProps: any = {};
            Object.keys(nonSignalProps).forEach((k) => {
                namedProps[getNamedKey(key, k)] = nonSignalProps[
                    k as keyof typeof nonSignalProps
                ] as any;
            });
            return namedProps;
        })(store);

        const storeWithComputed = withComputed(() => {
            const namedComputed: any = {};
            Object.keys(signalProps).forEach((k) => {
                namedComputed[getNamedKey(key, k)] = signalProps[
                    k as keyof typeof signalProps
                ] as any;
            });
            return namedComputed;
        })(storeWithProps);

        return storeWithComputed;
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

type PropsSignalsKeyType<PropsType> = {
    [x in keyof PropsType]: PropsType[x] extends Signal<any> ? x : never;
}[keyof PropsType];
type PropsSignalsType<PropsType> = {
    [x in PropsSignalsKeyType<PropsType>]: PropsType[x] extends Signal<any>
    ? PropsType[x]
    : never;
};

type PropsValueKeyType<PropsType> = {
    [x in keyof PropsType]: PropsType[x] extends Signal<any> ? never : x;
}[keyof PropsType];
type PropsValueType<PropsType> = {
    [x in PropsValueKeyType<PropsType>]: PropsType[x];
};

function buildPropsInformation<P extends object = object>(props: P) {
    const propsKeys = Object.keys(props) as (keyof P)[];

    const signalKeys = propsKeys.filter((k) =>
        isSignal(props[k])
    ) as PropsSignalsKeyType<P>[];
    const signalProps = signalKeys.reduce((acc, k) => {
        acc[k] = props[k] as PropsSignalsType<P>[typeof k];
        return acc;
    }, {} as PropsSignalsType<P>);

    const nonSignalKeys = propsKeys.filter(
        (k) => !isSignal(props[k])
    ) as PropsValueKeyType<P>[];
    const nonSignalProps = nonSignalKeys.reduce((acc, k) => {
        acc[k] = props[k];
        return acc;
    }, {} as PropsValueType<P>);

    return {
        nonSignalProps,
        signalProps,
    };
}
