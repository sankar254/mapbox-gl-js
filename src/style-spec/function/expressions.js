'use strict';

// @flow

const assert = require('assert');

const {
    NumberType,
    StringType,
    BooleanType,
    ColorType,
    ObjectType,
    ValueType,
    InterpolationType,
    typename,
    variant,
    array,
    lambda,
    nargs
} = require('./types');

/*::
 import type { PrimitiveType, TypeName, VariantType, ArrayType, NArgs, LambdaType, Type } from './types.js';

 import type { TypeError, TypedLambdaExpression, TypedLiteralExpression, TypedExpression } from './type_check.js';

 import type { CompiledExpression } from './compile.js';

 import type { ExpressionName } from './expression_name.js';

 export type Definition = {
     name: ExpressionName,
     type: LambdaType,
     compile: (args: Array<CompiledExpression>, expr: TypedLambdaExpression) => ({ js?: string, errors?: Array<string>, isFeatureConstant?: boolean, isZoomConstant?: boolean })
 }
 */

const expressions: { [string]: Definition } = {
    'ln2': defineMathConstant('ln2'),
    'pi': defineMathConstant('pi'),
    'e': defineMathConstant('e'),

    'typeof': {
        name: 'typeof',
        type: lambda(StringType, ValueType),
        compile: fromContext('typeOf')
    },

    // type assertions
    'string': {
        name: 'string',
        type: lambda(StringType, ValueType),
        compile: args => ({ js: `this.as(${args[0].js}, 'String')` })
    },
    'number': {
        name: 'string',
        type: lambda(NumberType, ValueType),
        compile: args => ({ js: `this.as(${args[0].js}, 'Number')` })
    },
    'boolean': {
        name: 'boolean',
        type: lambda(BooleanType, ValueType),
        compile: args => ({ js: `this.as(${args[0].js}, 'Boolean')` })
    },
    'array': {
        name: 'array',
        type: lambda(array(ValueType), ValueType),
        compile: (args) => ({js: `this.as(${args[0].js}, 'Array')`})
    },
    'object': {
        name: 'object',
        type: lambda(ObjectType, ValueType),
        compile: args => ({js: `this.as(${args[0].js}, 'Object')`})
    },

    // type coercion
    'to_string': {
        name: 'to_string',
        type: lambda(StringType, ValueType),
        compile: args => ({js: `this.toString(${args[0].js})`})
    },
    'to_number': {
        name: 'to_number',
        type: lambda(NumberType, ValueType),
        compile: args => ({js: `this.toNumber(${args[0].js})`})
    },
    'to_boolean': {
        name: 'to_boolean',
        type: lambda(BooleanType, ValueType),
        compile: args => ({js: `Boolean(${args[0].js})`})
    },
    'to_rgba': {
        name: 'to_rgba',
        type: lambda(array(NumberType, 4), ColorType),
        compile: args => ({js: `this.array('Array<Number, 4>', ${args[0].js}.value)`})
    },

    // color 'constructors'
    'parse_color': {
        name: 'parse_color',
        type: lambda(ColorType, StringType),
        compile: fromContext('parseColor')
    },
    'rgb': {
        name: 'rgb',
        type: lambda(ColorType, NumberType, NumberType, NumberType),
        compile: fromContext('rgba')
    },
    'rgba': {
        name: 'rgb',
        type: lambda(ColorType, NumberType, NumberType, NumberType, NumberType),
        compile: fromContext('rgba')
    },

    // object/array access
    'get': {
        name: 'get',
        type: lambda(ValueType, StringType, nargs(1, ObjectType)),
        compile: args => ({
            js: `this.get(${args.length > 1 ? args[1].js : 'props'}, ${args[0].js}, ${args.length > 1 ? 'undefined' : '"feature.properties"'})`,
            isFeatureConstant: args.length > 1 && args[1].isFeatureConstant
        })
    },
    'has': {
        name: 'has',
        type: lambda(BooleanType, StringType, nargs(1, ObjectType)),
        compile: args => ({
            js: `this.has(${args.length > 1 ? args[1].js : 'props'}, ${args[0].js}, ${args.length > 1 ? 'undefined' : '"feature.properties"'})`,
            isFeatureConstant: args.length > 1 && args[1].isFeatureConstant
        })
    },
    'at': {
        name: 'at',
        type: lambda(
            typename('T'),
            NumberType,
            array(typename('T'))
        ),
        compile: fromContext('at')
    },
    'length': {
        name: 'length',
        type: lambda(NumberType, variant(
            array(typename('T')),
            StringType
        )),
        compile: args => {
            let t = args[0].type;
            if (t.kind === 'lambda') { t = t.result; }
            assert(t.kind === 'array' || t.kind === 'primitive');
            return {
                js: t.kind === 'array' ?
                    `${args[0].js}.items.length` :
                    `${args[0].js}.length`
            };
        }
    },

    // feature and map data
    'properties': {
        name: 'properties',
        type: lambda(ObjectType),
        compile: () => ({
            js: 'this.as(props, "Object", "feature.properties")',
            isFeatureConstant: false
        })
    },
    'geometry_type': {
        name: 'geometry_type',
        type: lambda(StringType),
        compile: () => ({
            js: 'this.get(this.get(feature, "geometry", "feature"), "type", "feature.geometry")',
            isFeatureConstant: false
        })
    },
    'id': {
        name: 'id',
        type: lambda(ValueType),
        compile: () => ({
            js: 'this.get(feature, "id", "feature")',
            isFeatureConstant: false
        })
    },
    'zoom': {
        name: 'zoom',
        type: lambda(NumberType),
        compile: () => ({js: 'mapProperties.zoom', isZoomConstant: false})
    },

    // math
    '+': defineBinaryMathOp('+', true),
    '*': defineBinaryMathOp('*', true),
    '-': defineBinaryMathOp('-'),
    '/': defineBinaryMathOp('/'),
    '%': defineBinaryMathOp('%'),
    '^': {
        name: '^',
        type: lambda(NumberType, NumberType, NumberType),
        compile: args => ({js: `Math.pow(${args[0].js}, ${args[1].js})`})
    },
    'log10': defineMathFunction('log10', 1),
    'ln': defineMathFunction('ln', 1, 'log'),
    'log2': defineMathFunction('log2', 1),
    'sin': defineMathFunction('sin', 1),
    'cos': defineMathFunction('cos', 1),
    'tan': defineMathFunction('tan', 1),
    'asin': defineMathFunction('asin', 1),
    'acos': defineMathFunction('acos', 1),
    'atan': defineMathFunction('atan', 1),
    '==': defineComparisonOp('=='),
    '!=': defineComparisonOp('!='),
    '>': defineComparisonOp('>'),
    '<': defineComparisonOp('<'),
    '>=': defineComparisonOp('>='),
    '<=': defineComparisonOp('<='),
    '&&': defineBooleanOp('&&'),
    '||': defineBooleanOp('||'),
    '!': {
        name: '!',
        type: lambda(BooleanType, BooleanType),
        compile: args => ({js: `!(${args[0].js})`})
    },

    // string manipulation
    'upcase': {
        name: 'upcase',
        type: lambda(StringType, StringType),
        compile: args => ({js: `(${args[0].js}).toUpperCase()`})
    },
    'downcase': {
        name: 'downcase',
        type: lambda(StringType, StringType),
        compile: args => ({js: `(${args[0].js}).toLowerCase()`})
    },
    'concat': {
        name: 'concat',
        type: lambda(StringType, nargs(Infinity, ValueType)),
        compile: args => ({js: `[${args.map(a => a.js).join(', ')}].join('')`})
    },

    // decisions
    'case': {
        name: 'case',
        type: lambda(typename('T'), nargs(Infinity, BooleanType, typename('T')), typename('T')),
        compile: args => {
            args = [].concat(args);
            const result = [];
            while (args.length > 1) {
                const c = args.splice(0, 2);
                result.push(`${c[0].js} ? ${c[1].js}`);
            }
            assert(args.length === 1); // enforced by type checking
            result.push(args[0].js);
            return { js: result.join(':') };
        }
    },
    'match': {
        name: 'match',
        // note that, since they're pulled out during parsing, the input
        // values of type T aren't reflected in the signature here
        type: lambda(typename('T'), typename('U'), nargs(Infinity, typename('T'))),
        compile: (args, e) => {
            if (!e.matchInputs) { throw new Error('Missing match input values'); }
            const inputs = e.matchInputs;
            if (args.length !== inputs.length + 2) {
                return {
                    errors: [`Expected ${2 * inputs.length + 2} arguments, but found ${inputs.length + args.length} instead.`]
                };
            }

            const input = args[0].js;
            const outputs = args.slice(1).map(a => `() => ${a.js}`);

            // Construct a hash from input values (tagged with their type, to
            // distinguish e.g. 0 from "0") to the index of the corresponding
            // output. At evaluation time, look up this index and invoke the
            // (thunked) output expression.
            const inputMap = {};
            for (let i = 0; i < inputs.length; i++) {
                for (const v of inputs[i]) {
                    const type = v.type.name.slice(0, 1).toUpperCase() + v.type.name.slice(1);
                    inputMap[`${type}-${String(v.value)}`] = i;
                }
            }

            return {js: `
            (function () {
                var outputs = [${outputs.join(', ')}];
                var inputMap = ${JSON.stringify(inputMap)};
                var input = ${input};
                var outputIndex = inputMap[this.typeOf(input) + '-' + input];
                return typeof outputIndex === 'number' ? outputs[outputIndex]() :
                    outputs[${outputs.length - 1}]();
            }.bind(this))()`};
        }
    },

    'coalesce': {
        name: 'coalesce',
        type: lambda(typename('T'), nargs(Infinity, typename('T'))),
        compile: args => ({
            js: `this.coalesce(${args.map(a => `() => ${a.js}`).join(', ')})`
        })
    },

    'curve': {
        name: 'curve',
        type: lambda(typename('T'), InterpolationType, NumberType, nargs(Infinity, NumberType, typename('T'))),
        compile: args => {
            const interpolation = args[0].expression;
            if (interpolation.literal) { throw new Error('Invalid interpolation type'); } // enforced by type checking

            let resultType;
            if (args[3].type === NumberType) {
                resultType = 'number';
            } else if (args[3].type === ColorType) {
                resultType = 'color';
            } else if (
                args[3].type.kind === 'array' &&
                args[3].type.itemType === NumberType
            ) {
                resultType = 'array';
            } else if (interpolation.name !== 'step') {
                return {
                    errors: [`Type ${args[3].type.name} is not interpolatable, and thus cannot be used as a ${interpolation.name} curve's output type.`]
                };
            }

            const stops = [];
            const outputs = [];
            for (let i = 2; (i + 1) < args.length; i += 2) {
                const input = args[i].expression;
                const output = args[i + 1];
                if (!input.literal || typeof input.value !== 'number') {
                    return {
                        errors: [ 'Input/output pairs for "curve" expressions must be defined using literal numeric values (not computed expressions) for the input values.' ]
                    };
                }

                if (stops.length && stops[stops.length - 1] > input.value) {
                    return {
                        errors: [ 'Input/output pairs for "curve" expressions must be arranged with input values in strictly ascending order.' ]
                    };
                }

                stops.push(input.value);
                outputs.push(output.js);
            }

            const interpolationOptions: Object = {
                name: interpolation.name
            };

            if (interpolation.name === 'exponential') {
                const baseExpr = interpolation.arguments[0];
                if (!baseExpr.literal || typeof baseExpr.value !== 'number') {
                    return {errors: ["Exponential interpolation base must be a literal number value."]};
                }
                interpolationOptions.base = baseExpr.value;
            }

            return {js: `
            (function () {
                var input = ${args[1].js};
                var stopInputs = [${stops.join(', ')}];
                var stopOutputs = [${outputs.map(o => `() => ${o}`).join(', ')}];
                return this.evaluateCurve(${args[1].js}, stopInputs, stopOutputs, ${JSON.stringify(interpolationOptions)}, ${JSON.stringify(resultType)});
            }.bind(this))()`};
        }
    },
    'step': {
        name: 'step',
        type: lambda(InterpolationType),
        compile: () => ({ js: 'void 0' })
    },
    'exponential': {
        name: 'exponential',
        type: lambda(InterpolationType, NumberType),
        compile: () => ({ js: 'void 0' })
    },
    'linear': {
        name: 'step',
        type: lambda(InterpolationType),
        compile: () => ({ js: 'void 0' })
    }
};

module.exports = expressions;

function defineMathConstant(name) {
    const mathName = name.toUpperCase();
    assert(typeof Math[mathName] === 'number');
    return {
        name: name,
        type: lambda(NumberType),
        compile: () => ({ js: `Math.${mathName}` })
    };
}

function defineMathFunction(name: ExpressionName, arity: number, mathName?: string) {
    const key:string = mathName || name;
    assert(typeof Math[key] === 'function');
    assert(arity > 0);
    const args = [];
    while (arity-- > 0) args.push(NumberType);
    return {
        name: name,
        type: lambda(NumberType, ...args),
        compile: args => ({ js: `Math.${key}(${args.map(a => a.js).join(', ')})` })
    };
}

function defineBinaryMathOp(name, isAssociative) {
    const args = isAssociative ? [nargs(Infinity, NumberType)] : [NumberType, NumberType];
    return {
        name: name,
        type: lambda(NumberType, ...args),
        compile: args => ({ js: `${args.map(a => a.js).join(name)}` })
    };
}

function defineComparisonOp(name) {
    const op = name === '==' ? '===' :
        name === '!=' ? '!==' : name;
    return {
        name: name,
        type: lambda(BooleanType, typename('T'), typename('T')),
        compile: args => ({ js: `${args[0].js} ${op} ${args[1].js}` })
    };
}

function defineBooleanOp(op) {
    return {
        name: op,
        type: lambda(BooleanType, nargs(Infinity, BooleanType)),
        compile: args => ({ js: `${args.map(a => a.js).join(op)}` })
    };
}

function fromContext(name) {
    return args => {
        const argvalues = args.map(a => a.js).join(', ');
        return { js: `this.${name}(${argvalues})` };
    };
}
