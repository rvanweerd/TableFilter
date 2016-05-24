import {Feature} from '../feature';
import {createElm, createOpt, id} from '../dom';
import {has} from '../array';
import {matchCase} from '../string';
import {ignoreCase, numSortAsc, numSortDesc} from '../sort';
import Event from '../event';
import {SELECT, MULTIPLE, NONE} from '../const';

const SORT_ERROR = 'Filter options for column {0} cannot be sorted in ' +
    '{1} manner.';

export class Dropdown extends Feature {

    /**
     * Dropdown UI component
     * @param {Object} tf TableFilter instance
     */
    constructor(tf) {
        super(tf, 'dropdown');

        // Configuration object
        let f = tf.config();

        this.enableSlcResetFilter = f.enable_slc_reset_filter === false ?
            false : true;
        //defines empty option text
        this.nonEmptyText = f.non_empty_text || '(Non empty)';
        //IE only, tooltip text appearing on select before it is populated
        this.activateSlcTooltip = f.activate_slc_tooltip ||
            'Click to activate';
        //tooltip text appearing on multiple select
        this.multipleSlcTooltip = f.multiple_slc_tooltip ||
            'Use Ctrl key for multiple selections';

        this.isCustom = null;
        this.opts = null;
        this.optsTxt = null;
        this.slcInnerHtml = null;
    }

    onSlcFocus(e) {
        let elm = Event.target(e);
        let tf = this.tf;
        // select is populated when element has focus
        if (tf.loadFltOnDemand && elm.getAttribute('filled') === '0') {
            let ct = elm.getAttribute('ct');
            this.build(ct);
        }
        this.emitter.emit('filter-focus', tf, elm);
    }

    onSlcChange() {
        if (this.tf.onSlcChange) {
            this.tf.filter();
        }
    }

    /**
     * Initialize drop-down filter
     * @param  {Number}     colIndex   Column index
     * @param  {Boolean}    isExternal External filter flag
     * @param  {DOMElement} container  Dom element containing the filter
     */
    init(colIndex, isExternal, container) {
        let tf = this.tf;
        let col = tf.getFilterType(colIndex);
        let externalFltTgtId = isExternal ?
            tf.externalFltTgtIds[colIndex] : null;

        let slc = createElm(SELECT,
            ['id', tf.prfxFlt + colIndex + '_' + tf.id],
            ['ct', colIndex], ['filled', '0']
        );

        if (col === MULTIPLE) {
            slc.multiple = MULTIPLE;
            slc.title = this.multipleSlcTooltip;
        }
        slc.className = col.toLowerCase() === SELECT ?
            tf.fltCssClass : tf.fltMultiCssClass;

        //filter is appended in container element
        if (externalFltTgtId) {
            id(externalFltTgtId).appendChild(slc);
            tf.externalFltEls.push(slc);
        } else {
            container.appendChild(slc);
        }

        tf.fltIds.push(slc.id);

        if (!tf.loadFltOnDemand) {
            this.build(colIndex);
        } else {
            //1st option is created here since build isn't invoked
            let opt0 = createOpt(tf.displayAllText, '');
            slc.appendChild(opt0);
        }

        Event.add(slc, 'change', () => this.onSlcChange());
        Event.add(slc, 'focus', (e) => this.onSlcFocus(e));

        this.emitter.on(
            ['build-select-filter'],
            (tf, colIndex, isLinked, isExternal) =>
                this.build(colIndex, isLinked, isExternal)
        );
        this.emitter.on(
            ['select-options'],
            (tf, colIndex, values) => this.selectOptions(colIndex, values)
        );

        this.initialized = true;
    }

    /**
     * Build drop-down filter UI
     * @param  {Number}  colIndex    Column index
     * @param  {Boolean} isLinked    Enable linked refresh behaviour
     */
    build(colIndex, isLinked = false) {
        let tf = this.tf;
        colIndex = parseInt(colIndex, 10);

        this.emitter.emit('before-populating-filter', tf, colIndex);

        this.opts = [];
        this.optsTxt = [];
        this.slcInnerHtml = '';

        let slcId = tf.fltIds[colIndex];
        let slc = id(slcId);
        let rows = tf.tbl.rows;
        let nbRows = tf.getRowsNb(true);

        //custom select test
        this.isCustom = tf.isCustomOptions(colIndex);

        //custom selects text
        let activeIdx;
        let activeFilterId = tf.getActiveFilterId();
        if (isLinked && activeFilterId) {
            activeIdx = tf.getColumnIndexFromFilterId(activeFilterId);
        }

        let excludedOpts = null,
            filteredDataCol = null;
        if (isLinked && tf.disableExcludedOptions) {
            excludedOpts = [];
            filteredDataCol = [];
        }

        for (let k = tf.refRow; k < nbRows; k++) {
            // always visible rows don't need to appear on selects as always
            // valid
            if (tf.hasVisibleRows && tf.visibleRows.indexOf(k) !== -1) {
                continue;
            }

            let cell = rows[k].cells,
                nchilds = cell.length;

            // checks if row has exact cell #
            if (nchilds !== tf.nbCells || this.isCustom) {
                continue;
            }

            // this loop retrieves cell data
            for (let j = 0; j < nchilds; j++) {
                // WTF: cyclomatic complexity hell
                // TODO: simplify hell below
                if ((colIndex === j &&
                    (!isLinked ||
                        (isLinked && tf.disableExcludedOptions))) ||
                    (colIndex === j && isLinked &&
                        ((rows[k].style.display === '' && !tf.paging) ||
                            (tf.paging && (!tf.validRowsIndex ||
                                (tf.validRowsIndex &&
                                    tf.validRowsIndex.indexOf(k) !== -1)) &&
                                ((activeIdx === undefined ||
                                    activeIdx === colIndex) ||
                                    (activeIdx !== colIndex &&
                                    tf.validRowsIndex.indexOf(k) !== -1)))))) {
                    let cellData = tf.getCellData(cell[j]),
                        //Vary Peter's patch
                        cellString = matchCase(cellData, tf.matchCase);

                    // checks if celldata is already in array
                    if (!has(this.opts, cellString, tf.matchCase)) {
                        this.opts.push(cellData);
                    }

                    if (isLinked && tf.disableExcludedOptions) {
                        let filteredCol = filteredDataCol[j];
                        if (!filteredCol) {
                            filteredCol = tf.getFilteredDataCol(j);
                        }
                        if (!has(filteredCol, cellString, tf.matchCase) &&
                            !has(excludedOpts, cellString, tf.matchCase)) {
                            excludedOpts.push(cellData);
                        }
                    }
                }//if colIndex==j
            }//for j
        }//for k

        //Retrieves custom values
        if (this.isCustom) {
            let customValues = tf.getCustomOptions(colIndex);
            this.opts = customValues[0];
            this.optsTxt = customValues[1];
        }

        if (tf.sortSlc && !this.isCustom) {
            if (!tf.matchCase) {
                this.opts.sort(ignoreCase);
                if (excludedOpts) {
                    excludedOpts.sort(ignoreCase);
                }
            } else {
                this.opts.sort();
                if (excludedOpts) { excludedOpts.sort(); }
            }
        }

        //asc sort
        if (tf.sortNumAsc.indexOf(colIndex) !== -1) {
            try {
                this.opts.sort(numSortAsc);
                if (excludedOpts) {
                    excludedOpts.sort(numSortAsc);
                }
                if (this.isCustom) {
                    this.optsTxt.sort(numSortAsc);
                }
            } catch (e) {
                throw new Error(SORT_ERROR.replace('{0}', colIndex)
                    .replace('{1}', 'ascending'));
            }//in case there are alphanumeric values
        }
        //desc sort
        if (tf.sortNumDesc.indexOf(colIndex) !== -1) {
            try {
                this.opts.sort(numSortDesc);
                if (excludedOpts) {
                    excludedOpts.sort(numSortDesc);
                }
                if (this.isCustom) {
                    this.optsTxt.sort(numSortDesc);
                }
            } catch (e) {
                throw new Error(SORT_ERROR.replace('{0}', colIndex)
                    .replace('{1}', 'ascending'));
            }//in case there are alphanumeric values
        }

        //populates drop-down
        this.addOptions(colIndex, slc, isLinked, excludedOpts);

        this.emitter.emit('after-populating-filter', tf, colIndex, slc);
    }

    /**
     * Add drop-down options
     * @param {Number} colIndex     Column index
     * @param {Object} slc          Select Dom element
     * @param {Boolean} isLinked    Enable linked refresh behaviour
     * @param {Array} excludedOpts  Array of excluded options
     */
    addOptions(colIndex, slc, isLinked, excludedOpts) {
        let tf = this.tf,
            slcValue = slc.value;

        slc.innerHTML = '';
        slc = this.addFirstOption(slc);

        for (let y = 0; y < this.opts.length; y++) {
            if (this.opts[y] === '') {
                continue;
            }
            let val = this.opts[y]; //option value
            let lbl = this.isCustom ? this.optsTxt[y] : val; //option text
            let isDisabled = false;
            if (isLinked && tf.disableExcludedOptions &&
                has(excludedOpts, matchCase(val, tf.matchCase), tf.matchCase)) {
                isDisabled = true;
            }

            let opt;
            //fill select on demand
            if (tf.loadFltOnDemand && slcValue === this.opts[y] &&
                tf.getFilterType(colIndex) === SELECT) {
                opt = createOpt(lbl, val, true);
            } else {
                opt = createOpt(lbl, val, false);
            }
            if (isDisabled) {
                opt.disabled = true;
            }
            slc.appendChild(opt);
        }// for y

        slc.setAttribute('filled', '1');
    }

    /**
     * Add drop-down header option
     * @param {Object} slc Select DOM element
     */
    addFirstOption(slc) {
        let tf = this.tf;

        let opt0 = createOpt(
            (!this.enableSlcResetFilter ? '' : tf.displayAllText), '');
        if (!this.enableSlcResetFilter) {
            opt0.style.display = NONE;
        }
        slc.appendChild(opt0);
        if (tf.enableEmptyOption) {
            let opt1 = createOpt(tf.emptyText, tf.emOperator);
            slc.appendChild(opt1);
        }
        if (tf.enableNonEmptyOption) {
            let opt2 = createOpt(tf.nonEmptyText, tf.nmOperator);
            slc.appendChild(opt2);
        }
        return slc;
    }

    /**
     * Select filter options programmatically
     * @param  {Number} colIndex Column index
     * @param  {Array}  values   Array of option values to select
     */
    selectOptions(colIndex, values = []) {
        let tf = this.tf;
        if (tf.getFilterType(colIndex) !== MULTIPLE || values.length === 0) {
            return;
        }
        let slc = tf.getFilterElement(colIndex);
        [].forEach.call(slc.options, (option) => {
            // Empty value means clear all selections and first option is the
            // clear all option
            if (values[0] === '' || option.value === '') {
                option.selected = false;
            }

            if (option.value !== '' && has(values, option.value, true)) {
                option.selected = true;
            }//if
        });
    }

    /**
     * Get filter values for a given column index
     * @param {Number} colIndex Column index
     * @returns {Array}  values  Array of selected values
     */
    getValues(colIndex) {
        let tf = this.tf;
        let slc = tf.getFilterElement(colIndex);
        let values = [];

        // IE >= 9 does not support the selectedOptions property :(
        if (slc.selectedOptions) {
            [].forEach.call(slc.selectedOptions,
                option => values.push(option.value));
        } else {
            [].forEach.call(slc.options, (option) => {
                if (option.selected) {
                    values.push(option.value);
                }
            });
        }

        return values;
    }

    destroy() {
        this.emitter.off(
            ['build-select-filter'],
            (colIndex, isLinked, isExternal) =>
                this.build(colIndex, isLinked, isExternal)
        );
        this.emitter.off(
            ['select-options'],
            (tf, colIndex, values) => this.selectOptions(colIndex, values)
        );
    }
}
