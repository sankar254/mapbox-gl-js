'use strict';

const assert = require('assert');
const expressions = require('./expressions');
const compileExpression = require('./compile');
const convert = require('./convert');
const {ColorType, StringType, NumberType, ValueType, array} = require('./types');
const serialize = require('./type_check').serialize;

function createFunction(parameters, propertySpec) {
    let expr;
    if (!isFunctionDefinition(parameters)) {
        expr = convert.value(parameters, propertySpec);
    } else if (parameters.expression) {
        expr = parameters.expression;
        if (typeof propertySpec.default !== 'undefined') {
            const specDefault = convert.value(propertySpec.default);
            expr = ['coalesce', expr, specDefault];
        }
    } else {
        expr = convert.function(parameters, propertySpec);
    }

    const expectedType = getExpectedType(propertySpec);
    const compiled = compileExpression(expressions, expr, expectedType);
    if (compiled.result === 'success') {
        const f = function (zoom, properties) {
            const val = compiled.function({zoom}, {properties});
            return val === null ? undefined : val;
        };
        f.isFeatureConstant = compiled.isFeatureConstant;
        f.isZoomConstant = compiled.isZoomConstant;
        if (!f.isZoomConstant) {
            // capture metadata from the curve definition that's needed for
            // our prepopulate-and-interpolate approach to paint properties
            // that are zoom-and-property dependent.
            let curve = compiled.expression;
            if (curve.name !== 'curve') { curve = curve.arguments[0]; }
            const curveArgs = [].concat(curve.arguments);
            const interpolation = serialize(curveArgs.shift());

            f.zoomStops = [];
            for (let i = 1; i < curveArgs.length; i += 2) {
                f.zoomStops.push(curveArgs[i].value);
            }

            if (!f.isFeatureConstant) {
                const interpExpression = ['curve', interpolation, ['zoom']];
                for (let i = 0; i < f.zoomStops.length; i++) {
                    interpExpression.push(f.zoomStops[i], i);
                }
                const interpFunction = compileExpression(
                    expressions,
                    ['coalesce', interpExpression, 0],
                    NumberType
                );
                assert(!interpFunction.errors);
                f.interpolationT = interpFunction.function;
            }
        }
        return f;
    } else {
        throw new Error(compiled.errors.map(err => `${err.key}: ${err.error}`).join(', '));
    }
}

module.exports = createFunction;
module.exports.isFunctionDefinition = isFunctionDefinition;

function isFunctionDefinition(value) {
    return typeof value === 'object' &&
        (value.expression || value.stops || value.type === 'identity');
}

function getExpectedType(spec) {
    const types = {
        color: ColorType,
        string: StringType,
        number: NumberType,
        enum: StringType,
        image: StringType
    };

    if (spec.type === 'array') {
        return array(types[spec.value] || ValueType, spec.length);
    }

    return types[spec.type];
}

