/*!
 * Tempo Template Engine 2.1
 *
 * http://tempojs.com/
 */
function TempoEvent(type, item, element) {
    'use strict';
    this.type = type;
    this.item = item;
    this.element = element;

    return this;
}

TempoEvent.Types = {
    RENDER_STARTING: 'render_starting',
    ITEM_RENDER_STARTING: 'item_render_starting',
    ITEM_RENDER_COMPLETE: 'item_render_complete',
    RENDER_COMPLETE: 'render_complete',
    BEFORE_CLEAR: 'before_clear',
    AFTER_CLEAR: 'after_clear'
};


var Tempo = (function (tempo) {
    'use strict';

    /*!
     * Constants
     */
    var NUMBER_FORMAT_REGEX = /(\d+)(\d{3})/;


    var _window;


    /*!
     * Helpers
     */
    var utils = {
        memberRegex: function (obj) {
            var member_regex = '(';
            for (var member in obj) {
                if (obj.hasOwnProperty(member)) {
                    if (member_regex.length > 1) {
                        member_regex += '|';
                    }
                    member_regex += member;
                }
            }
            return member_regex + ')[\\.]?' + '(?!\\w)';
        },

        pad: function (val, pad, size) {
            while (val.length < size) {
                val = pad + val;
            }
            return val;
        },

        trim: function (str) {
            return str.replace(/^\s*([\S\s]*?)\s*$/, '$1');
        },

        startsWith: function (str, prefix) {
            return (str.indexOf(prefix) === 0);
        },

        clearContainer: function (el) {
            if (el !== null && el !== undefined && el.childNodes !== undefined) {
                for (var i = el.childNodes.length - 1; i >= 0; i--) {
                    if (el.childNodes[i] !== undefined && el.childNodes[i].getAttribute !== undefined && (el.childNodes[i].getAttribute('data-template') !== null || el.childNodes[i].getAttribute('data-template-for') !== null)) {
                        el.childNodes[i].parentNode.removeChild(el.childNodes[i]);
                    }
                }
            }
        },

        isNested: function (el) {
            var p = el.parentNode;
            while (p) {
                if (this.hasAttr(p, 'data-template') || this.hasAttr(p, 'data-template-for')) {
                    return true;
                }
                p = p.parentNode;
            }
            return false;
        },

        equalsIgnoreCase: function (str1, str2) {
            return str1.toLowerCase() === str2.toLowerCase();
        },

        getElement: function (template, html) {
            if (navigator.appVersion.indexOf("MSIE") > -1 && utils.equalsIgnoreCase(template.tagName, 'tr')) {
                // Wrapping to get around read-only innerHTML
                var el = _window.document.createElement('div');
                el.innerHTML = '<table><tbody>' + html + '</tbody></table>';
                var depth = 3;
                while (depth--) {
                    el = el.lastChild;
                }
                el.setAttribute('data-template', '');
                return el;
            } else {
                // No need to wrap
                template.innerHTML = html;
                return template;
            }
        },

        typeOf: function (obj) {
            if (typeof(obj) === "object") {
                if (obj === null) {
                    return "null";
                }
                if (obj.constructor === ([]).constructor) {
                    return "array";
                }
                if (obj.constructor === (new Date()).constructor) {
                    return "date";
                }
                if (obj.constructor === (new RegExp()).constructor) {
                    return "regex";
                }
                if (typeof HTMLElement === "object" ? obj instanceof HTMLElement : obj && typeof obj === "object" && obj.nodeType === 1 && typeof obj.nodeName === "string") {
                    return 'element';
                }
                if (typeof jQuery !== 'undefined' && obj instanceof jQuery) {
                    return 'jquery';
                }
                return "object";
            }
            return typeof(obj);
        },

        hasAttr: function (el, name) {
            if (el !== undefined) {
                if (el.hasAttribute !== undefined) {
                    return el.hasAttribute(name);
                } else if (el.getAttribute !== undefined) {
                    return el.getAttribute(name) !== null;
                }
            }

            return false;
        },

        removeAttr: function (el, name) {
            if (el !== undefined) {
                el.setAttribute(name, '');
//                if (el.removeAttribute) {
//                    el.removeAttribute(name);
//                }
            }
        },

        merge: function (obj1, obj2) {
            var obj3 = {};

            for (var attr1 in obj1) {
                if (obj1.hasOwnProperty(attr1)) {
                    obj3[attr1] = obj1[attr1];
                }
            }

            for (var attr2 in obj2) {
                if (obj2.hasOwnProperty(attr2)) {
                    obj3[attr2] = obj2[attr2];
                }
            }
            return obj3;
        },
        notify: function (listener, event) {
            if (listener !== undefined && listener.length > 0) {
                for (var i = 0; i < listener.length; i++) {
                    if (event.type === listener[i].type) {
                        listener[i].listener(event);
                    }
                }
            }
        },
        container: function (container) {
            if (utils.typeOf(container) === 'string') {
                if (container === '*') {
                    container = _window.document.getElementsByTagName('html')[0];
                } else {
                    container = _window.document.getElementById(container);
                }
            } else if (utils.typeOf(container) === 'jquery' && container.length > 0) {
                container = container[0];
            }

            return container;
        },
        arrayContains: function (array, obj) {
            if (!Array.prototype.indexOf) {
                for (var i = 0; i < this.length; i++) {
                    if (this[i] === obj) {
                        return true;
                    }
                }
                return false;
            } else {
                return array.indexOf(obj) > -1;
            }
                                    }
    };

    function Templates(params, nestedItem) {
        this.params = params;
        this.defaultTemplate = null;
        this.namedTemplates = {};
        this.container = null;

        this.nestedItem = nestedItem !== undefined ? nestedItem : null;

        this.escape = true;
        this.var_brace_left = '\\{\\{';
        this.var_brace_right = '\\}\\}';
        this.tag_brace_left = '\\{%';
        this.tag_brace_right = '%\\}';

        this.dataIsMap = false;

        this.attributes = {};

        if (typeof params !== 'undefined') {
            for (var prop in params) {
                if (prop === 'var_braces') {
                    this.var_brace_left = params[prop].substring(0, params[prop].length / 2);
                    this.var_brace_right = params[prop].substring(params[prop].length / 2);
                } else if (prop === 'tag_braces') {
                    this.tag_brace_left = params[prop].substring(0, params[prop].length / 2);
                    this.tag_brace_right = params[prop].substring(params[prop].length / 2);
                } else if (typeof this[prop] !== 'undefined') {
                    this[prop] = params[prop];
                }
            }
        }

        return this;
    }

    Templates.prototype = {
        load: function (file, callback) {
            function contents(iframe) {
                return iframe.contentWindow ? iframe.contentWindow.document.documentElement.innerHTML : iframe.contentDocument ? iframe.contentDocument.body.innerHTML : iframe.document.body.innerHTML;
            }

            if (_window.document.getElementById(file) !== null) {
                callback(contents(_window.document.getElementById(file)));
            } else {
                var el = _window.document.createElement('iframe');
                el.id = file;
                el.name = file;
                el.style.height = 0;
                el.style.width = 0;
                el.src = file;

                if (el.attachEvent) {
                    el.attachEvent('onload', function () {
                        callback(contents(el));
                    });
                } else {
                    el.onload = function () {
                        callback(contents(el));
                    };
                }

                _window.document.body.appendChild(el);
            }
        },
        _insertTemplate: function (child, templates, container, callback) {
            return function (el) {
                utils.removeAttr(child, 'data-template-file');
                child.innerHTML = el;
                templates.parse(container, callback);
            };
        },

        parse: function (container, callback) {
            this.container = container;
            var children = container.getElementsByTagName('*');

            var ready = true;

            // Preprocessing for referenced templates
            for (var i = 0; i < children.length; i++) {
                if (ready === true && callback !== undefined && utils.hasAttr(children[i], 'data-template-file')) {
                    var child = children[i];
                    if (child.getAttribute('data-template-file').length > 0) {
                        var templates = this;
                        ready = false;

                        this.load(child.getAttribute('data-template-file'), this._insertTemplate(child, templates, container, callback));
                    }
                } else if (utils.hasAttr(children[i], 'data-template-fallback')) {
                    // Hiding the fallback template
                    children[i].style.display = 'none';
                }
            }

            // Parsing
            if (ready) {
                var foundTemplates = {};
                for (var s = 0; s < children.length; s++) {
                    if (children[s].getAttribute !== undefined) {
                        if (utils.hasAttr(children[s], 'data-template-for') && children[s].getAttribute('data-template-for').length > 0 && this.nestedItem === children[s].getAttribute('data-template-for') && !foundTemplates[this.nestedItem]) {
                            // Nested template
                            this.createTemplate(children[s]);
                            // Guards against recursion when child template has same name!
                            foundTemplates[this.nestedItem] = true;
                        } else if (utils.hasAttr(children[s], 'data-template') && !utils.isNested(children[s])) {
                            // Normal template
                            this.createTemplate(children[s]);
                        }
                    }
                }

                // If there is no default template (data-template) then create one from container
//                if (this.defaultTemplate === null) {
//                    this.createTemplate(container);
//                }

                utils.clearContainer(this.container);
                if (callback !== undefined) {
                    callback(this);
                }
            }
        },

        createTemplate: function (node) {
            var element = node.cloneNode(true);

            // Clear display: none;
            if (element.style.removeAttribute) {
                element.style.removeAttribute('display');
            } else if (element.style.removeProperty) {
                element.style.removeProperty('display');
            } else {
                element.style.display = 'block';
            }

            // Remapping container element in case template
            // is deep in container
            this.container = node.parentNode;

            // Element is a template
            var nonDefault = false;
            for (var a = 0; a < element.attributes.length; a++) {
                var attr = element.attributes[a];
                // If attribute
                if (utils.startsWith(attr.name, 'data-if-')) {
                    var val;
                    if (attr.value === '') {
                        val = true;
                    } else if (attr.value === 'null') {
                        val = null;
                    } else {
                        val = '\'' + attr.value + '\'';
                    }
                    this.namedTemplates[attr.name.substring(8, attr.name.length) + '==' + val] = element;
                    utils.removeAttr(element, attr.name);
                    nonDefault = true;
                } else if (attr.name === 'data-has') {
                    this.namedTemplates[attr.value + '!==undefined'] = element;
                    utils.removeAttr(element, attr.name);
                    nonDefault = true;
                } else if (attr.name === 'data-from-map') {
                    this.dataIsMap = true;
                } else if (!utils.startsWith(attr.name, 'data-template') && utils.startsWith(attr.name, 'data-')) {
                    // Treat as an attribute for template
                    this.attributes[attr.name.substring(5, attr.name.length)] = attr.value;
                }
            }
            // Setting as default template, last one wins
            if (!nonDefault) {
                this.defaultTemplate = element;
            }
        },

        templateFor: function (i) {
            for (var templateName in this.namedTemplates) {
                if (eval('i.' + templateName)) {
                    return this.namedTemplates[templateName].cloneNode(true);
                }
            }
            if (this.defaultTemplate) {
                return this.defaultTemplate.cloneNode(true);
            }
        }
    };


    /*!
     * Renderer for populating containers with data using templates.
     */
    function Renderer(templates) {
        this.templates = templates;
        this.listener = [];
        this.started = false;
        this.varRegex = new RegExp(this.templates.var_brace_left + '[ ]?([A-Za-z0-9$\\._\\[\\]]*?)([ ]?\\|[ ]?.*?)?[ ]?' + this.templates.var_brace_right, 'g');
        this.tagRegex = new RegExp(this.templates.tag_brace_left + '[ ]?([\\s\\S]*?)( [\\s\\S]*?)?[ ]?' + this.templates.tag_brace_right + '(([\\s\\S]*?)(?=' + this.templates.tag_brace_left + '[ ]?end\\1[ ]?' + this.templates.tag_brace_right + '))?', 'g');
        this.filterSplitter = new RegExp('\\|[ ]?(?=' + utils.memberRegex(this.filters) + ')', 'g');
        this.errorHandler = null;
        return this;
    }

    Renderer.prototype = {
        when: function (type, listener) {
            this.listener.push({'type': type, 'listener': listener});

            return this;
        },

        _getValue: function (renderer, variable, i, t) {
            var val = null;
            // Handling tempo_info variable
            if (utils.startsWith(variable, '_tempo.')) {
                return eval('t.' + variable.substring(7, variable.length));
            }

            if (variable === '.') {
                val = eval('i');
            } else if (variable === 'this' || variable.match(/this[\\[\\.]/) !== null) {
                val = eval('i' + variable.substring(4, variable.length));
            } else if (utils.typeOf(i) === 'array') {
                val = eval('i' + variable);
            } else {
                val = eval('i.' + variable);
            }

            return val;
        },

        _replaceVariables: function (renderer, _tempo, i, str) {
            var self = this;
            return str.replace(this.varRegex, function (match, variable, args) {

                try {
                    var val = renderer._getValue(renderer, variable, i, _tempo);
                    // Handle filters
                    if (args !== undefined && args !== '') {
                        var filters = utils.trim(utils.trim(args).substring(1)).split(self.filterSplitter);
                        for (var p = 0; p < filters.length; p++) {
                            var filter = utils.trim(filters[p]), filter_args, j = filter.indexOf(' ');
                            // If there is a space, there must be arguments
                            if (~j) {
                                filter_args = filter.substr(j).replace(/(^ *['"])|(['"] *$)/g, '').split(/['"] *, *['"]/);
                                filter = filter.substr(0, j);
                            } else {
                                filter_args = [];
                            }
                            val = renderer.filters[filter](val, filter_args);
                        }
                    }

                    if (val !== undefined) {
                        if (self.templates.escape) {
                            val = self.filters.escape(val, {});
                        }
                        return val;
                    }
                } catch (err) {
                    self._onError.call(self, err);
                }

                return '';
            });
        },

        _replaceObjects: function (renderer, _tempo, i, str, regex) {
            return str.replace(regex, function (match, variable, args) {
                try {
                    var val = renderer._getValue(renderer, variable, i, _tempo);

                    if (val !== undefined) {
                        if (utils.typeOf(val) === 'string') {
                            return '\'' + val + '\'';
                        } else {
                            return val;
                        }
                    }
                } catch (err) {
                    self._onError.call(self, err);
                }

                return undefined;
            });
        },

        _applyAttributeSetters: function (renderer, item, str) {
            // Adding a space in front of first part to make sure I don't get partial matches
            return str.replace(/(\b[A-z0-9]+?)(?:="[^"']*?"[^>]*?)data-\1="(.*?)"/g, function (match, attr, data_value) {
                if (data_value !== '') {
                    return attr + '="' + data_value + '"';
                }
                return match;
            });
        },

        _applyTags: function (renderer, item, str) {
            return str.replace(this.tagRegex, function (match, tag, args, body) {
                if (renderer.tags.hasOwnProperty(tag)) {
                    args = args.substring(args.indexOf(' ')).replace(/^[ ]*|[ ]*$/g, '');
                    var filter_args = args.split(/(?:['"])[ ]?,[ ]?(?:['"])/);
                    return renderer.tags[tag](renderer, item, match, filter_args, body);
                } else {
                    return '';
                }
            });
        },

        starting: function (event) {
            // Use this to manually fire the RENDER_STARTING event e.g. just before you issue an AJAX request
            // Useful if you're not calling prepare immediately before render
            this.started = true;
            if (event === undefined) {
                event = new TempoEvent(TempoEvent.Types.RENDER_STARTING, undefined, undefined);
            }
            utils.notify(this.listener, event);

            return this;
        },

        _renderNestedItem: function (i, nested) {
            var self = this;
            return function (templates) {
                var r = new Renderer(templates);
                var data = null;

                if (nested === '*' || i.hasOwnProperty(nested.split('.')[0])) {
                    if (nested === '*') {
                        data = i;
                    } else {
                        data = eval('i.' + nested);
                    }

                    if (data) {
                        try {
                            if (utils.typeOf(data) === 'array') {
                                for (var s = 0; s < data.length; s++) {
                                    if (utils.typeOf(data[s]) === 'object') {
                                        data[s]._parent = function () {
                                            return i;
                                        }()
                                    }
                                }
                            } else {
                                data._parent = function () {
                                    return i;
                                }();
                            }
                        } catch (err) {
                            self._onError.call(self, err);
                        }
                    }
                }
                r.render(data);
            };
        },

        renderItem: function (renderer, _tempo_info, i, fragment) {
            var memberRegex = new RegExp('(?:__[\\.]?)((_tempo|\\[|' + utils.memberRegex(i) + '|this)([A-Za-z0-9$\\._\\[\\]]+)?)', 'g');
            var template = renderer.templates.templateFor(i);
            var tempo_info = utils.merge(_tempo_info, renderer.templates.attributes);

            // Clear attributes in case of recursive nesting (TODO: Probably need to clear more)
            if (utils.hasAttr(template, 'data-template-for')) {
                utils.removeAttr(template, 'data-template-for');
            }
            if (utils.hasAttr(template, 'data-template-file')) {
                utils.removeAttr(template, 'data-template-file');
            }

            if (template && i) {
                utils.notify(this.listener, new TempoEvent(TempoEvent.Types.ITEM_RENDER_STARTING, i, template));
                var nestedDeclaration = template.innerHTML.match(/data-template-for="([^"]+?)"/g);
                if (nestedDeclaration) {
                    for (var p = 0; p < nestedDeclaration.length; p++) {
                        var nested = nestedDeclaration[p].match(/data-template-for="([^"]+?)"/);
                        if (nested && nested[1]) {
                            var t = new Templates(renderer.templates.params, nested[1]);
                            try {
                                t.parse(template, this._renderNestedItem(i, nested[1]));
                            } catch (err) {
                                this._onError.call(this, err);
                            }
                        }
                    }
                }

                // Processing template element attributes
                for (var a = 0; a < template.attributes.length; a++) {
                    var attr = template.attributes[a];
                    if (attr !== null && attr.specified && attr.value !== null && attr.value.length > 0 && attr.name.match(/style|data-template.*/) === null) {
                        attr.value = this._applyTags(this, i, attr.value);
                        attr.value = this._replaceVariables(this, tempo_info, i, attr.value);
                    }
                }

                // Dealing with HTML as a String from now on (to be reviewed)
                // Attribute values are escaped in FireFox so making sure there are no escaped tags
                var html = template.innerHTML.replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}');

                // Tags
                html = this._applyTags(this, i, html);

                // Content
                html = this._replaceVariables(this, tempo_info, i, html);

                // JavaScript objects
                html = this._replaceObjects(this, tempo_info, i, html, memberRegex);

                html = this._applyAttributeSetters(this, i, html);

                fragment.appendChild(utils.getElement(template, html));

                utils.notify(this.listener, new TempoEvent(TempoEvent.Types.ITEM_RENDER_COMPLETE, i, template));
            }
        },

        _createFragment: function (data) {
            if (data) {
                var tempo_info = {};
                var fragment = _window.document.createDocumentFragment();

                // If object then wrapping in an array
                if (utils.typeOf(data) === 'object') {
                    if (this.templates.dataIsMap) {
                        var mapped = [];
                        for (var member in data) {
                            if (data.hasOwnProperty(member) && member !== '_parent') {
                                var pair = {};
                                pair.key = member;
                                pair.value = data[member];
                                mapped.push(pair);
                            }
                        }
                        data = mapped;
                    } else {
                        data = [data];
                    }
                }

                for (var i = 0; i < data.length; i++) {
                    tempo_info.index = i;
                    tempo_info.first = i < 1;
                    tempo_info.last = i == data.length - 1;
                    this.renderItem(this, tempo_info, data[i], fragment);
                }

                return fragment;
            }

            return null;
        },

        into: function (target) {
            if (target !== undefined) {
                this.templates.container = utils.container(target);
            }

            return this;
        },

        render: function (data) {
            // Check if starting event was manually fired
            if (!this.started) {
                this.starting(new TempoEvent(TempoEvent.Types.RENDER_STARTING, data, this.templates.container));
            }

            this.clear();
            this.append(data);

            return this;
        },

        append: function (data) {
            // Check if starting event was manually fired
            if (!this.started) {
                this.starting(new TempoEvent(TempoEvent.Types.RENDER_STARTING, data, this.templates.container));
            }

            var fragment = this._createFragment(data);
            if (fragment !== null && this.templates.container !== null) {
                if (fragment !== null) {
                    var ref = null;
                    for (var i = this.templates.container.childNodes.length; i >= 0; i--) {

                        if (this.templates.container.childNodes[i] !== undefined && this.templates.container.childNodes[i].getAttribute !== undefined && this.templates.container.childNodes[i].getAttribute('data-after-template') !== null) {
                            ref = this.templates.container.childNodes[i];
                        }
                    }
                    if (ref === null) {
                        ref = this.templates.container.lastChild;
                    }
                    if (ref !== null) {
                        this.templates.container.insertBefore(fragment, ref);
                    } else {
                        this.templates.container.appendChild(fragment);
                    }
                }
            }

            utils.notify(this.listener, new TempoEvent(TempoEvent.Types.RENDER_COMPLETE, data, this.templates.container));

            return this;
        },

        prepend: function (data) {
            // Check if starting event was manually fired
            if (!this.started) {
                this.starting(new TempoEvent(TempoEvent.Types.RENDER_STARTING, data, this.templates.container));
            }

            var fragment = this._createFragment(data);
            if (fragment !== null) {
                var ref = null;
                for (var i = 0; i < this.templates.container.childNodes.length; i++) {
                    if (this.templates.container.childNodes[i] !== undefined && this.templates.container.childNodes[i].getAttribute !== undefined && this.templates.container.childNodes[i].getAttribute('data-before-template') !== null) {
                        ref = this.templates.container.childNodes[i];
                    }
                }
                if (ref === null) {
                    ref = this.templates.container.firstChild;
                }
                if (ref !== null) {
                    if (ref.nextSibling !== null && ref.getAttribute && ref.getAttribute('data-before-template') !== null) {
                        ref = ref.nextSibling;
                    }
                    this.templates.container.insertBefore(fragment, ref);
                } else {
                    this.templates.container.appendChild(fragment);
                }
            }

            utils.notify(this.listener, new TempoEvent(TempoEvent.Types.RENDER_COMPLETE, data, this.templates.container));

            return this;
        },

        errors: function (errorHandler) {
            this.errorHandler = errorHandler;
            return this;
        },

        _onError: function (err) {
            if (this.errorHandler !== null) {
                this.errorHandler.call(this, err);
            }
        },

        clear: function () {
            utils.notify(this.listener, new TempoEvent(TempoEvent.Types.BEFORE_CLEAR, {}, this.templates.container));
            utils.clearContainer(this.templates.container);
            utils.notify(this.listener, new TempoEvent(TempoEvent.Types.AFTER_CLEAR, {}, this.templates.container));
        },

        tags: {
            'if': function (renderer, i, match, args, body) {
                var member_regex = utils.memberRegex(i);

                var expr = args[0].replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
                expr = expr.replace(new RegExp(member_regex, 'gi'), function (match) {
                    return 'i.' + match;
                });

                var blockRegex = new RegExp(renderer.templates.tag_brace_left + '[ ]?else[ ]?' + renderer.templates.tag_brace_right, 'g');
                var blocks = body.split(blockRegex);

                if (eval(expr)) {
                    return blocks[0];
                } else if (blocks.length > 1) {
                    return blocks[1];
                }

                return '';
            }
        },

        filters: {
            'escape': function (value, args) {
                return value.toString().replace(/[&<>]/g, function (c) {
                    return {
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;'
                    }[c] || c;
                });
            },
            'encodeURI': function (value, args) {
                return encodeURI(value.toString());
            },
            'decodeURI': function (value, args) {
                return decodeURI(value.toString());
            },
            'truncate': function (value, args) {
                if (value !== undefined) {
                    var len = 0;
                    var rep = '...';
                    if (args.length > 0) {
                        len = parseInt(args[0], 10);
                    }
                    if (args.length > 1) {
                        rep = args[1];
                    }
                    if (value.length > len - 3) {
                        return value.substr(0, len - 3) + rep;
                    }
                    return value;
                }
            },
            'format': function (value, args) {
                if (value !== undefined) {
                    if (args.length === 1) {
                        value = parseFloat(value + '').toFixed(parseInt(args[0], 10));
                    }
                    var x = (value + '').split('.');
                    var x1 = x[0];
                    var x2 = x.length > 1 ? '.' + x[1] : '';

                    while (NUMBER_FORMAT_REGEX.test(x1)) {
                        x1 = x1.replace(NUMBER_FORMAT_REGEX, '$1' + ',' + '$2');
                    }

                    return x1 + x2;
                }
            },
            'upper': function (value, args) {
                return value.toUpperCase();
            },
            'lower': function (value, args) {
                return value.toLowerCase();
            },
            'titlecase': function (value, args) {
                var blacklist = [];
                if (args !== undefined && args.length === 1) {
                    blacklist = args[0].split(' ');
                }
                return value.replace(/\w[a-z]\S*/g, function (m, i) {
                    if (blacklist.length === 0 || !(utils.arrayContains(blacklist, m) && i > 0)) {
                        return m.charAt(0).toUpperCase() + m.substr(1).toLowerCase();
                    }
                    return m;
                });
            },
            'trim': function (value, args) {
                return utils.trim(value);
            },
            'replace': function (value, args) {
                if (value !== undefined && args.length === 2) {
                    return value.replace(new RegExp(args[0], 'g'), args[1]);
                }
                return value;
            },
            'append': function (value, args) {
                if (value !== undefined && args.length === 1) {
                    return value + '' + args[0];
                }
                return value;
            },
            'prepend': function (value, args) {
                if (value !== undefined && args.length === 1) {
                    return args[0] + '' + value;
                }
                return value;
            },
            'join': function (value, args) {
                if (args.length === 1 && value !== undefined && utils.typeOf(value) === 'array') {
                    return value.join(args[0]);
                }
                return value;
            },
            'default': function (value, args) {
                if (value !== undefined && value !== null) {
                    return value;
                }
                if (args.length === 1) {
                    return args[0];
                }
                return value;
            },
            'date': function (value, args) {
                if (value !== undefined && args.length >= 1 && args.length <= 2) {
                    var date = new Date(value);
                    var format = args[0];
                    var isUTC = (args.length === 2 && args[1] === 'UTC');
                    if (format === 'localedate') {
                        return date.toLocaleDateString();
                    } else if (format === 'localetime') {
                        return date.toLocaleTimeString();
                    } else if (format === 'date') {
                        return date.toDateString();
                    } else if (format === 'time') {
                        return date.toTimeString();
                    } else {
                        var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                        var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        var DATE_PATTERNS = {
                            'YYYY': function (date) {
                                return (isUTC ? date.getUTCFullYear() : date.getFullYear());
                            },
                            'YY': function (date) {
                                return (isUTC ? date.getUTCFullYear() : date.getFullYear()).toFixed().substring(2);
                            },
                            'MMMM': function (date) {
                                return MONTHS[(isUTC ? date.getUTCMonth() : date.getMonth())];
                            },
                            'MMM': function (date) {
                                return MONTHS[(isUTC ? date.getUTCMonth() : date.getMonth())].substring(0, 3);
                            },
                            'MM': function (date) {
                                return utils.pad(((isUTC ? date.getUTCMonth() : date.getMonth()) + 1).toFixed(), '0', 2);
                            },
                            'M': function (date) {
                                return (isUTC ? date.getUTCMonth() : date.getMonth()) + 1;
                            },
                            'DD': function (date) {
                                return utils.pad((isUTC ? date.getUTCDate() : date.getDate()).toFixed(), '0', 2);
                            },
                            'D': function (date) {
                                return (isUTC ? date.getUTCDate() : date.getDate());
                            },
                            'EEEE': function (date) {
                                return DAYS[(isUTC ? date.getUTCDay() : date.getDay())];
                            },
                            'EEE': function (date) {
                                return DAYS[(isUTC ? date.getUTCDay() : date.getDay())].substring(0, 3);
                            },
                            'E': function (date) {
                                return (isUTC ? date.getUTCDay() : date.getDay());
                            },
                            'HH': function (date) {
                                return utils.pad((isUTC ? date.getUTCHours() : date.getHours()).toFixed(), '0', 2);
                            },
                            'H': function (date) {
                                return (isUTC ? date.getUTCHours() : date.getHours());
                            },
                            'h': function (date) {
                                var hours = (isUTC ? date.getUTCHours() : date.getHours());
                                return hours < 13 ? (hours === 0 ? 12 : hours) : hours - 12;
                            },
                            'mm': function (date) {
                                return utils.pad((isUTC ? date.getUTCMinutes() : date.getMinutes()).toFixed(), '0', 2);
                            },
                            'm': function (date) {
                                return (isUTC ? date.getUTCMinutes() : date.getMinutes());
                            },
                            'ss': function (date) {
                                return utils.pad((isUTC ? date.getUTCSeconds() : date.getSeconds()).toFixed(), '0', 2);
                            },
                            's': function (date) {
                                return (isUTC ? date.getUTCSeconds() : date.getSeconds());
                            },
                            'SSS': function (date) {
                                return utils.pad((isUTC ? date.getUTCMilliseconds() : date.getMilliseconds()).toFixed(), '0', 3);
                            },
                            'S': function (date) {
                                return (isUTC ? date.getUTCMilliseconds() : date.getMilliseconds());
                            },
                            'a': function (date) {
                                return (isUTC ? date.getUTCHours() : date.getHours()) < 12 ? 'AM' : 'PM';
                            }
                        };
                        format = format.replace(/(\\)?(Y{2,4}|M{1,4}|D{1,2}|E{1,4}|H{1,2}|h|m{1,2}|s{1,2}|S{1,3}|a)/g,
                            function (match, escape, pattern) {
                                if (!escape) {
                                    if (DATE_PATTERNS.hasOwnProperty(pattern)) {
                                        return DATE_PATTERNS[pattern](date);
                                    }
                                }
                                return pattern;
                            });

                        return format;
                    }
                }

                return '';
            }
        }
    };

    /*!
     * Initialising Tempo with a Window object in case running inside Node.
     */
    tempo.init = function (window) {
        _window = window;

        return this;
    };

    /*!
     * Prepare a container for rendering, gathering templates and
     * clearing afterwards.
     */
    tempo.prepare = function (container, params, callback) {
        container = utils.container(container);

        var templates = new Templates(params);
        if (callback !== undefined) {
            templates.parse(container, function (templates) {
                callback(new Renderer(templates));
            });
        } else {
            templates.parse(container);
            return new Renderer(templates);
        }
    };

    tempo.exports = {
        'templates': Templates,
        'utils': utils
    };

    tempo.test = {
        'utils': utils,
        'templates': new Templates({}),
        'renderer': new Renderer(new Templates({}))
    };


    // Default initialisation
    try {
        tempo.init(window);
    } catch (e) {
        exports.tempo = tempo;
    }

    return tempo;

})(Tempo || {});
