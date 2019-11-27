import React, {useEffect, useContext, useReducer, useCallback} from 'react';
import PropTypes from 'prop-types';
import {getBox} from 'css-box-model';
import {DiscussionContext} from 'context/DiscussionContext';
import Summary from "../Summary/Summary";
import {DragDropContext} from "react-beautiful-dnd";
import * as tweenFunctions from "tween-functions";
import Category from "../Categories/Category";
import {isMobile} from 'react-device-detect';
import Element from "../DragAndDrop/Element";
import Argument from "../Argument/Argument";
import Column from "../DragAndDrop/Column";
import {CategoryDataObject, ArgumentDataObject, getDnDId} from '../utils.js';
import {ActionMenuDataObject} from "../utils";

function Surface() {
    const context = useContext(DiscussionContext);

    function stateHeadQuarter(state, action) {
        switch (action.type) {
            case 'move':
                const {
                    from,
                    to
                } = action.payload;
                const newCategories = Array.from(state.categories);
                const movedArgument = newCategories[newCategories.findIndex(category => getDnDId(category) === from.droppableId)].connectedArguments.splice(from.index, 1);
                newCategories[newCategories.findIndex(category => getDnDId(category) === to.droppableId)].connectedArguments.splice(to.index, 0, movedArgument[0]);

                return {
                    ...state,
                    categories: newCategories,
                    hasRemainingUnprocessedArguments: newCategories.filter(category => category.isArgumentDefaultList && category.connectedArguments.length > 0).length > 0,
                };
            case 'editArgument': {
                const {
                    id,
                    argumentText,
                } = action.payload;
                const newArguments = JSON.parse(JSON.stringify(state.argumentsList));
                const argumentIndex = newArguments.findIndex(argument => argument.id === id);
                if (argumentIndex !== -1) {
                    const argument = newArguments[argumentIndex];
                    argument.argumentText = argumentText;
                    argument.editMode = false;
                }
                return {
                    ...state,
                    argumentsList: newArguments
                };
            }
            case 'deleteArgument': {
                const {
                    id
                } = action.payload;
                const categories = JSON.parse(JSON.stringify(state.categories))
                    .map(category => {
                        category.connectedArguments = category.connectedArguments.filter(connectedArgument => connectedArgument !== id);
                        return category;
                    });
                const argumentsList = state.argumentsList.filter(argument => argument.id !== id);

                return {
                    ...state,
                    categories,
                    argumentsList,
                }
            }
            case 'addArgument': {
                const {
                    id
                } = action.payload;

                const argumentsList = Array.from(state.argumentsList);
                const argumentId = state.idCounter + 1;
                argumentsList.push(new ArgumentDataObject({
                    id: argumentId,
                    added: true,
                    editMode: true,
                }));

                const categories = JSON.parse(JSON.stringify(state.categories));
                const targetIndex = categories.findIndex(category => category.id === id);
                if (targetIndex === -1) {
                    return {
                        ...state
                    };
                }
                categories[targetIndex].connectedArguments.push(argumentId);
                return {
                    ...state,
                    argumentsList,
                    categories,
                    idCounter: argumentId,
                }
            }
            case 'reset': {
                return init();
            }
            default:
                return state;
        }
    }

    const memoizedReducer = useCallback(stateHeadQuarter, []);
    const [state, dispatch] = useReducer(memoizedReducer, init());

    let api;
    const autoDragSensor = value => {
        api = value;
    };

    useEffect(() => {
        context.trigger('resize');
    }, [state.argumentsList, state.categories]);

    const {
        collectExportValues,
        registerReset,
        translate,
        behaviour: {
            allowAddingOfArguments = true,
        }
    } = context;

    registerReset(() => dispatch({type: "reset"}));
    collectExportValues('userInput', () => ({categories: state.categories, argumentsList: state.argumentsList}));

    function init() {
        const {
            translate,
            params: {
                argumentsList: argumentDataList = [],
            },
            behaviour: {
                randomizeArguments = true,
            }
        } = context;

        if (randomizeArguments === true) {
            argumentDataList.sort(() => 0.5 - Math.random());
        }

        const argumentsList = argumentDataList.map((argument, index) => (new ArgumentDataObject({
            id: index,
            argumentText: argument,
        })));

        const categories = [];
        if (argumentsList.length > 0) {
            categories.push(new CategoryDataObject({
                id: 'unprocessed',
                isArgumentDefaultList: true,
                connectedArguments: argumentsList.filter(argument => argument.id % 2 === 0).map(argument => argument.id)
            }));
            categories.push(new CategoryDataObject({
                id: 'unprocessed-2',
                isArgumentDefaultList: true,
                connectedArguments: argumentsList.filter(argument => argument.id % 2 === 1).map(argument => argument.id)
            }));
        }
        categories.push(new CategoryDataObject({
            id: 'pro',
            theme: 'h5p-discussion-pro',
            useNoArgumentsPlaceholder: true,
            title: translate('argumentsFor'),
        }));
        categories.push(new CategoryDataObject({
            id: 'contra',
            theme: 'h5p-discussion-against',
            useNoArgumentsPlaceholder: true,
            title: translate('argumentsAgainst'),
        }));

        return {
            categories,
            argumentsList,
            idCounter: argumentsList.length - 1,
            hasRemainingUnprocessedArguments: argumentsList.length > 0,
        }
    }

    function onDropEnd(dragResult) {
        let {
            destination,
            source,
        } = dragResult;

        if (!destination) {
            return;
        }

        dispatch({
            type: 'move', payload: {
                from: source,
                to: destination
            }
        });
    }

    function getDynamicActions(argument) {
        const dynamicActions = state.categories
            .filter(category => category.isArgumentDefaultList !== true)
            .map(category => new ActionMenuDataObject({
                id: category.id,
                title: category.title,
                type: 'category',
                activeCategory: category.connectedArguments.findIndex(argumentId => argumentId === argument.id) !== -1,
                onSelect: () => startMoving(getDnDId(argument), category.id)
            }));
        if( allowAddingOfArguments === true ){
            dynamicActions.push(new ActionMenuDataObject({
                type: 'delete',
                title: translate('deleteArgument'),
                onSelect: () => dispatch({
                    type: 'deleteArgument',
                    payload: {id: argument.id},
                })
            }));
        }
        return dynamicActions;
    }

    function moveStepByStep(drag, values) {
        requestAnimationFrame(() => {
            const newPosition = values.shift();
            drag.move(newPosition);

            if (values.length) {
                moveStepByStep(drag, values);
            } else {
                drag.drop();
                if( isMobile ){
                    scroll(newPosition);
                }
            }
        });
    }

    function scroll(position) {
        const frame = window.frameElement ? parent : window;
        frame.scrollTo({
            top: position.y,
            behavior: 'smooth',
        });
    }

    const startMoving = function start(draggableElement, target) {
        const preDrag = api.tryGetLock(draggableElement);
        if (!preDrag) {
            return;
        }
        const targetContainer = getBox(document.getElementById(target));
        const dragElement = getBox(document.getElementById(draggableElement));
        const start = dragElement.borderBox.center;
        const end = {
            x: targetContainer.borderBox.center.x,
            y: targetContainer.borderBox.bottom - (Math.min(15, targetContainer.borderBox.height / 4))
        };
        const drag = preDrag.fluidLift(start);

        const points = [];
        const numberOfPoints = 60;
        for (let i = 0; i < numberOfPoints; i++) {
            points.push({
                x: tweenFunctions.easeOutQuad(i, start.x, end.x, numberOfPoints),
                y: tweenFunctions.easeOutQuad(i, start.y, end.y, numberOfPoints)
            });
        }

        moveStepByStep(drag, points);
    };

    return (
        <div
            className="h5p-discussion-surface"
        >
            <DragDropContext
                onDragEnd={onDropEnd}
                sensors={[autoDragSensor]}
            >
                <Category
                    categoryId={"unprocessed"}
                    includeHeader={false}
                    additionalClassName={["h5p-discussion-unprocessed", !state.hasRemainingUnprocessedArguments ? "hidden" : ""]}
                    useNoArgumentsPlaceholder={false}
                >
                {state.categories
                    .filter(category => category.isArgumentDefaultList)
                    .map(category => (
                        <div
                            key={category.id}
                        >
                            <Column
                                additionalClassName={"h5p-discussion-unprocessed-argument-list"}
                                droppableId={getDnDId(category)}
                            >
                                {category.connectedArguments
                                    .map(argument => state.argumentsList[state.argumentsList.findIndex(element => element.id === argument)])
                                    .map((argument, index) => (
                                        <Element
                                            key={getDnDId(argument)}
                                            draggableId={getDnDId(argument)}
                                            dragIndex={index}
                                        >
                                            <Argument
                                                actions={getDynamicActions(argument)}
                                                isDragEnabled={!isMobile}
                                                argument={argument}
                                                enableEditing={allowAddingOfArguments}
                                                onArgumentChange={argumentText => dispatch({
                                                    type: 'editArgument',
                                                    payload: {id: argument.id, argumentText}
                                                })}
                                            />
                                        </Element>
                                    ))}
                            </Column>
                        </div>
                    ))}
                    </Category>
                {state.categories
                    .filter(category => !category.isArgumentDefaultList)
                    .map(category => (
                    <Category
                        key={category.id}
                        categoryId={category.id}
                        includeHeader={category.title !== null}
                        title={category.title}
                        additionalClassName={[category.theme]}
                        useNoArgumentsPlaceholder={category.useNoArgumentsPlaceholder}
                        addArgument={allowAddingOfArguments}
                        onAddArgument={() => dispatch(
                            {
                                type: 'addArgument', payload: {
                                    id: category.id,
                                }
                            })}
                    >
                        <Column
                            additionalClassName={"h5p-discussion-argument-list"}
                            droppableId={getDnDId(category)}
                        >
                            {category.useNoArgumentsPlaceholder && category.connectedArguments.length === 0 && (
                                <span>{translate('noArguments')}</span>
                            )}
                            {category.connectedArguments
                                .map(argument => state.argumentsList[state.argumentsList.findIndex(element => element.id === argument)])
                                .map((argument, index) => (
                                    <Element
                                        key={getDnDId(argument)}
                                        draggableId={getDnDId(argument)}
                                        dragIndex={index}
                                    >
                                        <Argument
                                            actions={getDynamicActions(argument)}
                                            isDragEnabled={!isMobile}
                                            argument={argument}
                                            enableEditing={allowAddingOfArguments}
                                            onArgumentChange={argumentText => dispatch({
                                                type: 'editArgument',
                                                payload: {id: argument.id, argumentText}
                                            })}
                                        />
                                    </Element>
                                ))}
                        </Column>
                    </Category>
                ))}
            </DragDropContext>
            <Summary/>
        </div>
    );
}

export default Surface;
