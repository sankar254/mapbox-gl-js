'use strict';
// @flow

/*::
 import type { PrimitiveType, TypeName, VariantType, ArrayType, NArgs, LambdaType, Type } from './types.js';

 import type { ExpressionName } from './expression_name.js';

 export type TypeError = {|
     error: string,
     key: string
 |}

 export type TypedLambdaExpression = {|
     literal: false,
     name: ExpressionName,
     type: LambdaType,
     arguments: Array<TypedExpression>,
     key: string,
     matchInputs?: Array<Array<TypedLiteralExpression>>
 |}

 export type TypedLiteralExpression = {|
     literal: true,
     value: string | number | boolean | null,
     type: Type,
     key: string
 |}

 export type TypedExpression = TypedLambdaExpression | TypedLiteralExpression

 */

const assert = require('assert');
const util = require('../../util/util');

const { NullType, lambda, array, variant, nargs } = require('./types');

module.exports = typeCheckExpression;
module.exports.serialize = serializeExpression;

// typecheck the given expression and return a new TypedExpression
// tree with all generics resolved
function typeCheckExpression(expected: Type, e: TypedExpression) /*: TypedExpression | {| errors: Array<TypeError> |} */ {
    if (e.literal) {
        const error = match(expected, e.type);
        if (error) return { errors: [{ key: e.key, error }] };
        return e;
    } else {
        // e is a lambda expression, so check its result type against the
        // expected type and recursively typecheck its arguments

        const typenames: { [string]: Type } = {};

        if (expected.kind !== 'lambda') {
            // if the expected type is not a lambda, then check if it matches
            // the expression's output type, and then proceed with type checking
            // the arguments using e.type, which comes from the expression
            // definition.
            const error = match(expected, e.type.result, {}, typenames);
            if (error) return { errors: [{ key: e.key, error }] };
            expected = e.type;
        } else {
            const error = match(expected.result, e.type.result, typenames);
            if (error) return { errors: [{ key: e.key, error }] };
        }

        // "Unroll" NArgs if present in the parameter list:
        // argCount = nargType.type.length * n + nonNargParameterCount
        // where n is the number of times the NArgs sequence must be
        // repeated.
        const argValues = e.arguments;
        const expandedParams = [];
        const errors = [];
        for (const param of expected.params) {
            if (param.kind === 'nargs') {
                let count = (argValues.length - (expected.params.length - 1)) / param.types.length;
                count = Math.min(param.N, Math.ceil(count));
                while (count-- > 0) {
                    for (const type of param.types) {
                        expandedParams.push(type);
                    }
                }
            } else {
                expandedParams.push(param);
            }
        }

        if (expandedParams.length !== argValues.length) {
            return {
                errors: [{
                    key: e.key,
                    error: `Expected ${expandedParams.length} arguments, but found ${argValues.length} instead.`
                }]
            };
        }

        // Iterate through arguments to:
        //  - match parameter type vs argument type, checking argument's result type only (don't recursively typecheck subexpressions at this stage)
        //  - collect typename mappings when ^ succeeds or type errors when it fails
        for (let i = 0; i < argValues.length; i++) {
            const param = expandedParams[i];
            const arg = argValues[i];
            const error = match(
                resolveTypenamesIfPossible(param, typenames),
                arg.type,
                typenames
            );
            if (error) errors.push({ key: arg.key, error });
        }

        const resultType = resolveTypenamesIfPossible(expected.result, typenames);

        if (isGeneric(resultType)) return {
            errors: [{key: e.key, error: `Could not resolve ${e.type.result.name}.  This expression must be wrapped in a type conversion, e.g. ["string", ${stringifyExpression(e)}].`}]
        };

        // If we already have errors, return early so we don't get duplicates when
        // we typecheck against the resolved argument types
        if (errors.length) return { errors };

        // resolve typenames and recursively type check argument subexpressions
        const resolvedParams = [];
        const checkedArgs = [];
        for (let i = 0; i < expandedParams.length; i++) {
            const t = expandedParams[i];
            const arg = argValues[i];
            const expected = resolveTypenamesIfPossible(t, typenames);
            const result = typeCheckExpression(expected, arg);
            if (result.errors) {
                errors.push.apply(errors, result.errors);
            } else if (errors.length === 0) {
                resolvedParams.push(expected);
                checkedArgs.push(result);
            }
        }

        // handle 'match' expression input values
        let matchInputs;
        if (e.matchInputs) {
            matchInputs = [];
            const inputType = resolvedParams[0];
            for (const inputGroup of e.matchInputs) {
                const checkedGroup = [];
                for (const inputValue of inputGroup) {
                    const result = typeCheckExpression(inputType, inputValue);
                    if (result.errors) {
                        errors.push.apply(errors, result.errors);
                    } else {
                        checkedGroup.push(result);
                    }
                }
                matchInputs.push(checkedGroup);
            }
        }

        if (errors.length > 0) return { errors };

        const ret = {
            literal: false,
            name: e.name,
            type: lambda(resultType, ...resolvedParams),
            arguments: checkedArgs,
            key: e.key,
            matchInputs
        };

        return ret;
    }
}

/**
 * Returns null if the type matches, or an error message if not.
 *
 * Also populate the given typenames maps: `expectedTypenames` maps typenames
 * from the scope of `expected` to Types, and `tTypenames` does the same for
 * typenames from t's typename scope.
 *
 * @private
 */
function match(expected: Type, t: Type, expectedTypenames: { [string]: Type } = {}, tTypenames: { [string]: Type } = {}) {
    if (t.kind === 'lambda') t = t.result;
    const errorMessage = `Expected ${expected.name} but found ${t.name} instead.`;

    if (expected.kind === 'typename') {
        if (!expectedTypenames[expected.typename] && !isGeneric(t) && t !== NullType) {
            expectedTypenames[expected.typename] = t;
        }
        return null;
    }

    if (t.kind === 'typename' && !isGeneric(expected)) {
        if (!tTypenames[t.typename] && t !== NullType) {
            tTypenames[t.typename] = expected;
        }
        t = expected;
    }

    if (t.name === 'null') return null;

    if (expected.kind === 'primitive') {
        if (t === expected) return null;
        else return errorMessage;
    } else if (expected.kind === 'array') {
        if (t.kind === 'array') {
            const error = match(expected.itemType, t.itemType, expectedTypenames, tTypenames);
            if (error) return `${errorMessage}. (${error})`;
            else if (typeof expected.N === 'number' && expected.N !== t.N) return errorMessage;
            else return null;
        } else {
            return errorMessage;
        }
    } else if (expected.kind === 'variant') {
        if (t === expected) return null;

        for (const memberType of expected.members) {
            const mExpectedTypenames = util.extend({}, expectedTypenames);
            const mTTypenames = util.extend({}, tTypenames);
            const error = match(memberType, t, mExpectedTypenames, mTTypenames);
            if (!error) {
                util.extend(expectedTypenames, mExpectedTypenames);
                util.extend(tTypenames, mTTypenames);
                return null;
            }
        }

        // If t itself is a variant, then 'expected' must match each of its
        // member types in order for this to be a match.
        if (t.kind === 'variant') return t.members.some(m => match(expected, m, expectedTypenames, tTypenames)) ? errorMessage : null;

        return errorMessage;
    }

    throw new Error(`${expected.name} is not a valid output type.`);
}

function serializeExpression(e: TypedExpression, withTypes) {
    if (e.literal) {
        return e.value;
    } else {
        return [ e.name + (withTypes ? `: ${e.type.kind === 'lambda' ? e.type.result.name : e.type.name}` : '') ].concat(e.arguments.map(e => serializeExpression(e, withTypes)));
    }
}
function stringifyExpression(e: TypedExpression, withTypes) /*:string*/ {
    return JSON.stringify(serializeExpression(e, withTypes));
}

function isGeneric (type, stack = []) {
    if (stack.indexOf(type) >= 0) { return false; }
    if (type.kind === 'typename') {
        return true;
    } else if (type.kind === 'array') {
        return isGeneric(type.itemType, stack.concat(type));
    } else if (type.kind === 'variant') {
        return type.members.some((t) => isGeneric(t, stack.concat(type)));
    } else if (type.kind === 'nargs') {
        return type.types.some((t) => isGeneric(t, stack.concat(type)));
    } else if (type.kind === 'lambda') {
        return isGeneric(type.result) || type.params.some((t) => isGeneric(t, stack.concat(type)));
    }
    return false;
}

function resolveTypenamesIfPossible(type: Type, typenames: {[string]: Type}, stack = []) /*: Type */{
    assert(stack.indexOf(type) < 0, 'resolveTypenamesIfPossible() implementation does not support recursive variants.');

    if (!isGeneric(type)) return type;
    if (type.kind === 'typename') return typenames[type.typename] || type;

    const resolve = (t) => resolveTypenamesIfPossible(t, typenames, stack.concat(type));
    if (type.kind === 'array') return array(resolve(type.itemType, typenames), type.N);
    if (type.kind === 'variant') return variant(...type.members.map(resolve));
    if (type.kind === 'nargs') return nargs(type.N, ...type.types.map(resolve));
    if (type.kind === 'lambda') return lambda(resolve(type.result), ...type.params.map(resolve));

    assert(false, `Unsupported type ${type.kind}`);
    return type;
}

