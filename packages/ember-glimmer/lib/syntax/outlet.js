import { ArgsSyntax, StatementSyntax } from 'glimmer-runtime';
import { ConstReference } from 'glimmer-reference';
import { generateGuid, guidFor } from 'ember-metal/utils';
import { RootReference } from '../utils/references';

function outletComponentFor(vm) {
  let { outletState, isTopLevel } = vm.dynamicScope();

  if (isTopLevel) {
    return new TopLevelOutletComponentReference(outletState);
  } else {
    let args = vm.getArgs();
    let outletName = args.positional.at(0).value() || 'main';
    return new OutletComponentReference(outletName, outletState.get(outletName));
  }
}

export class OutletSyntax extends StatementSyntax {
  constructor({ args }) {
    super();
    this.definitionArgs = args;
    this.definition = outletComponentFor;
    this.args = ArgsSyntax.empty();
    this.templates = null;
    this.shadow = null;
  }

  compile(builder) {
    builder.component.dynamic(this);
  }
}

class TopLevelOutletComponentReference extends ConstReference {
  constructor(reference) {
    let outletState = reference.value();
    let definition = new TopLevelOutletComponentDefinition(outletState.render.template);

    super(definition);
  }
}

class OutletComponentReference {
  constructor(outletName, reference) {
    this.outletName = outletName;
    this.reference = reference;
    this.definition = null;
    this.lastState = null;
    this.tag = reference.tag;
  }

  value() {
    let { outletName, reference, definition, lastState } = this;
    let newState = this.lastState = reference.value();

    definition = revalidate(definition, lastState, newState);

    let hasTemplate = newState && newState.render.template;

    if (definition) {
      return definition;
    } else if (hasTemplate) {
      return this.definition = new OutletComponentDefinition(outletName, newState.render.template);
    } else {
      return null;
    }
  }
}

function revalidate(definition, lastState, newState) {
  if (!lastState && !newState) {
    return definition;
  }

  if (!lastState && newState || lastState && !newState) {
    return null;
  }

  if (
    newState.render.template === lastState.render.template &&
    newState.render.controller === lastState.render.controller
  ) {
    return definition;
  }

  return null;
}


class AbstractOutletComponentManager {
  create(definition, args, dynamicScope) {
    throw new Error('Not implemented: create');
  }

  ensureCompilable(definition) {
    return definition;
  }

  getSelf(state) {
    return new RootReference(state.render.controller);
  }

  getTag(state) {
    return null;
  }

  getDestructor(state) {
    return null;
  }

  didCreateElement() {}
  didCreate(state) {}
  update(state, args, dynamicScope) {}
  didUpdate(state) {}
}

class TopLevelOutletComponentManager extends AbstractOutletComponentManager {
  create(definition, args, dynamicScope) {
    dynamicScope.isTopLevel = false;
    return dynamicScope.outletState.value();
  }
}

const TOP_LEVEL_MANAGER = new TopLevelOutletComponentManager();

class OutletComponentManager extends AbstractOutletComponentManager {
  create(definition, args, dynamicScope) {
    let outletStateReference = dynamicScope.outletState = dynamicScope.outletState.get(definition.outletName);
    let outletState = outletStateReference.value();
    dynamicScope.targetObject = dynamicScope.controller = outletState.render.controller;
    return outletState;
  }
}

const MANAGER = new OutletComponentManager();

import { ComponentDefinition } from 'glimmer-runtime';

class AbstractOutletComponentDefinition extends ComponentDefinition {
  constructor(manager, outletName, template) {
    super('outlet', manager, null);
    this.outletName = outletName;
    this.template = template;
    generateGuid(this);
  }

  compile() {
    throw new Error('Unimplemented: compile');
  }
}

class TopLevelOutletComponentDefinition extends AbstractOutletComponentDefinition {
  constructor(template) {
    super(TOP_LEVEL_MANAGER, null, template);
  }

  compile(builder) {
    builder.wrapLayout(this.template.asLayout());
    builder.tag.static('div');
    builder.attrs.static('id', guidFor(this));
    builder.attrs.static('class', 'ember-view');
  }
}

class OutletComponentDefinition extends AbstractOutletComponentDefinition {
  constructor(outletName, template) {
    super(MANAGER, outletName, template);
  }

  compile(builder) {
    builder.wrapLayout(this.template.asLayout());
  }
}
