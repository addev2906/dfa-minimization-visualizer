// Data Structures
let dfa = {
    states: [],
    alphabet: [],
    start: '',
    accept: [],
    transitions: {}
};
let minimizationSteps = [];
let currentStep = 0;
let originalNetwork = null;
let minimizedNetwork = null;
let originalNodes = new vis.DataSet([]);
let originalEdges = new vis.DataSet([]);
let isSyncingFromGraph = false;

// Default Data to pre-fill
const defaultTransitions = {
    'A': {'0': 'B', '1': 'C'},
    'B': {'0': 'A', '1': 'D'},
    'C': {'0': 'E', '1': 'F'},
    'D': {'0': 'E', '1': 'F'},
    'E': {'0': 'E', '1': 'F'},
    'F': {'0': 'F', '1': 'F'}
};

// DOM Elements
const inputs = {
    states: document.getElementById('input-states'),
    alphabet: document.getElementById('input-alphabet'),
    start: document.getElementById('input-start'),
    accept: document.getElementById('input-accept'),
};
const errorMsg = document.getElementById('error-message');

// Initialization
function init() {
    initOriginalNetwork();
    attachInputListeners();
    updateFormFromInputs();
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
    errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => errorMsg.classList.add('hidden'), 5000);
}

function clearErrors() {
    errorMsg.classList.add('hidden');
    document.querySelectorAll('.error-input').forEach(el => {
        el.classList.remove('error-input', 'border-red-500', 'bg-red-50');
    });
}

function parseCommaSeparated(str) {
    return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function attachInputListeners() {
    inputs.states.addEventListener('input', updateFormFromInputs);
    inputs.alphabet.addEventListener('input', updateFormFromInputs);
    inputs.start.addEventListener('change', () => { if (!isSyncingFromGraph) syncInputsToGraph(); });
    inputs.accept.addEventListener('input', () => { if (!isSyncingFromGraph) syncInputsToGraph(); });
    document.getElementById('transitions-body').addEventListener('change', (e) => { 
        if (e.target && e.target.classList) {
            e.target.classList.remove('error-input', 'border-red-500', 'bg-red-50');
        }
        if (!isSyncingFromGraph) syncInputsToGraph(); 
    });
    document.getElementById('btn-minimize').addEventListener('click', startMinimization);
}

function updateFormFromInputs() {
    if (isSyncingFromGraph) return;

    const states = parseCommaSeparated(inputs.states.value);
    const alphabet = parseCommaSeparated(inputs.alphabet.value);
    
    // Update Start State Dropdown
    const currentStart = inputs.start.value;
    inputs.start.innerHTML = '';
    states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        inputs.start.appendChild(opt);
    });
    if (states.includes(currentStart)) {
        inputs.start.value = currentStart;
    } else if (states.length > 0) {
        inputs.start.value = states[0];
    }

    // Render Transition Table Form
    const thead = document.getElementById('transitions-head');
    const tbody = document.getElementById('transitions-body');
    
    let headHTML = '<tr><th class="px-4 py-2 border-b">State</th>';
    alphabet.forEach(a => headHTML += `<th class="px-4 py-2 border-b text-center">Input ${a}</th>`);
    headHTML += '</tr>';
    thead.innerHTML = headHTML;

    let bodyHTML = '';
    states.forEach(s => {
        bodyHTML += `<tr><td class="px-4 py-2 border-b font-medium">${s}</td>`;
        alphabet.forEach(a => {
            let val = defaultTransitions[s] && defaultTransitions[s][a] ? defaultTransitions[s][a] : '';
            // Try to preserve existing inputs if they exist
            const existingInput = document.getElementById(`trans-${s}-${a}`);
            if (existingInput) val = existingInput.value;
            
            bodyHTML += `<td class="px-4 py-2 border-b"><select id="trans-${s}-${a}" class="w-full border rounded p-1 outline-none">`;
            bodyHTML += `<option value="">--</option>`;
            states.forEach(target => {
                bodyHTML += `<option value="${target}" ${val === target ? 'selected' : ''}>${target}</option>`;
            });
            bodyHTML += `</select></td>`;
        });
        bodyHTML += '</tr>';
    });
    tbody.innerHTML = bodyHTML;
    syncInputsToGraph();
}

function readDFA() {
    clearErrors();
    
    const states = parseCommaSeparated(inputs.states.value);
    const alphabet = parseCommaSeparated(inputs.alphabet.value);
    const start = inputs.start.value;
    const accept = parseCommaSeparated(inputs.accept.value).filter(s => states.includes(s));
    
    let transitions = {};
    let hasErrors = false;

    states.forEach(s => {
        transitions[s] = {};
        alphabet.forEach(a => {
            const sel = document.getElementById(`trans-${s}-${a}`);
            if (!sel || !sel.value) {
                hasErrors = true;
                if (sel) {
                    sel.classList.add('error-input', 'border-red-500', 'bg-red-50');
                }
            } else {
                transitions[s][a] = sel.value;
            }
        });
    });

    if (hasErrors) {
        showError("Please fill in all missing transition entries (highlighted in red).");
        return null;
    }

    if (!states.includes(start)) {
        showError("Start state is not in the states list.");
        inputs.start.classList.add('error-input', 'border-red-500', 'bg-red-50');
        return null;
    }

    dfa = { states, alphabet, start, accept, transitions };
    syncInputsToGraph();
    return dfa;
}

function getReachableStates(targetDfa) {
    let reachable = new Set([targetDfa.start]);
    let queue = [targetDfa.start];
    while (queue.length > 0) {
        let curr = queue.shift();
        for (let a of targetDfa.alphabet) {
            let next = targetDfa.transitions[curr][a];
            if (next && !reachable.has(next)) {
                reachable.add(next);
                queue.push(next);
            }
        }
    }
    return Array.from(reachable);
}

function minimizeLogic() {
    minimizationSteps = [];
    currentStep = 0;

    const reachable = getReachableStates(dfa);
    const unreachable = dfa.states.filter(s => !reachable.includes(s));
    
    if (unreachable.length > 0) {
        minimizationSteps.push({
            title: "Step 0: Remove Unreachable States",
            desc: `States ${unreachable.join(', ')} cannot be reached from the start state and are removed.`,
            partitions: [reachable],
            analysisHtml: `<div class="p-3 bg-gray-50 rounded">Reachable states: <strong>{ ${reachable.join(', ')} }</strong></div>`
        });
    }

    let currentPartitions = [];
    let acceptGroup = reachable.filter(s => dfa.accept.includes(s));
    let nonAcceptGroup = reachable.filter(s => !dfa.accept.includes(s));
    
    if (nonAcceptGroup.length > 0) currentPartitions.push(nonAcceptGroup);
    if (acceptGroup.length > 0) currentPartitions.push(acceptGroup);

    minimizationSteps.push({
        title: "Step 1: Initial Partition (P₀)",
        desc: "Separate states into Non-Accepting and Accepting sets.",
        partitions: JSON.parse(JSON.stringify(currentPartitions)),
        analysisHtml: generateAnalysisHtml(currentPartitions, reachable, dfa, null)
    });

    let changed = true;
    let stepNum = 1;

    while (changed) {
        changed = false;
        let nextPartitions = [];
        let splitsOccurred = false;

        // For documentation
        let analysisData = [];

        for (let i=0; i<currentPartitions.length; i++) {
            let group = currentPartitions[i];
            if (group.length <= 1) {
                nextPartitions.push(group);
                analysisData.push({ group, splits: [group] });
                continue;
            }

            // Check transitions
            let signatures = {};
            for (let state of group) {
                let sig = dfa.alphabet.map(a => {
                    let dest = dfa.transitions[state][a];
                    let destIdx = currentPartitions.findIndex(p => p.includes(dest));
                    return destIdx !== -1 ? destIdx : "err";
                }).join(',');
                
                if (!signatures[sig]) signatures[sig] = [];
                signatures[sig].push(state);
            }

            let subGroups = Object.values(signatures);
            if (subGroups.length > 1) {
                changed = true;
                splitsOccurred = true;
            }
            nextPartitions.push(...subGroups);
            analysisData.push({ group, splits: subGroups, signatures });
        }

        if (changed) {
            stepNum++;
            currentPartitions = nextPartitions;
            minimizationSteps.push({
                title: `Step ${stepNum}: Partition Refinement (P${stepNum-1})`,
                desc: "Split groups whose states transition to different groups for identical inputs.",
                partitions: JSON.parse(JSON.stringify(currentPartitions)),
                analysisHtml: generateStepAnalysisHtml(analysisData, currentPartitions, dfa)
            });
        }
    }

    minimizationSteps.push({
        title: "Final Step: Minimization Complete",
        desc: "No further splits can be made. The partitions represent the minimal states.",
        partitions: JSON.parse(JSON.stringify(currentPartitions)),
        analysisHtml: `<div class="p-4 bg-green-50 text-green-800 rounded border border-green-200">The partitions are stable. Minimization is complete!</div>`,
        isFinal: true
    });

    buildMinimizedDFA(currentPartitions);
}

function generateAnalysisHtml(partitions, reachable, dfa, msg) {
    let html = `<p class="mb-4 text-sm text-gray-600">${msg || 'Initial separation based on accepting status.'}</p>`;
    html += `<table class="w-full text-sm text-left border"><thead class="bg-gray-100"><tr><th class="p-2 border">Group</th><th class="p-2 border">States</th></tr></thead><tbody>`;
    partitions.forEach((p, idx) => {
        let isAccepting = dfa.accept.includes(p[0]) ? '(Accepting)' : '(Non-Accepting)';
        html += `<tr><td class="p-2 border font-bold">Group ${idx}</td><td class="p-2 border">{ ${p.join(', ')} } <span class="text-xs text-gray-500">${isAccepting}</span></td></tr>`;
    });
    html += `</tbody></table>`;
    return html;
}

function generateStepAnalysisHtml(analysisData, newPartitions, dfa) {
    let html = `<p class="mb-4 text-sm text-gray-600">Checking transitions for each group in the previous partition.</p>`;
    
    analysisData.forEach(data => {
        html += `<div class="mb-6 border rounded overflow-hidden">
            <div class="bg-gray-100 p-2 font-semibold border-b">Analyzing previous group: { ${data.group.join(', ')} }</div>
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="p-2 border-b border-r">State</th>`;
        dfa.alphabet.forEach(a => html += `<th class="p-2 border-b text-center">Input ${a} &rarr; Target (Group)</th>`);
        html += `   </tr>
                </thead>
                <tbody>`;
        
        data.group.forEach(s => {
            html += `<tr><td class="p-2 border-b border-r font-medium">${s}</td>`;
            dfa.alphabet.forEach(a => {
                let dest = dfa.transitions[s][a];
                // Find which group dest belonged to in PREVIOUS partition... actually displaying new is fine, 
                // but technically it depends on previous. Let's just show target state.
                html += `<td class="p-2 border-b text-center">${dest}</td>`;
            });
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        if (data.splits.length > 1) {
            html += `<div class="p-2 bg-yellow-50 text-yellow-800 text-xs border-t">Splits into: ${data.splits.map(g => '{'+g.join(',')+'}').join(' and ')}</div>`;
        } else {
            html += `<div class="p-2 bg-gray-50 text-gray-600 text-xs border-t">No split required.</div>`;
        }
        html += `</div>`;
    });

    return html;
}

function buildMinimizedDFA(partitions) {
    let minStates = partitions.map(p => p.join(''));
    let minStart = partitions.find(p => p.includes(dfa.start)).join('');
    let minAccept = partitions.filter(p => p.some(s => dfa.accept.includes(s))).map(p => p.join(''));
    let minTransitions = {};

    partitions.forEach(p => {
        let name = p.join('');
        minTransitions[name] = {};
        let rep = p[0];
        dfa.alphabet.forEach(a => {
            let dest = dfa.transitions[rep][a];
            let destPart = partitions.find(dp => dp.includes(dest));
            let destName = destPart ? destPart.join('') : '';
            minTransitions[name][a] = destName;
        });
    });

    minimizedDFAData = {
        states: minStates,
        alphabet: dfa.alphabet,
        start: minStart,
        accept: minAccept,
        transitions: minTransitions,
        displayNames: partitions.map(p => `[${p.join(',')}]`) // Formatted names for nodes
    };
}

let minimizedDFAData = null;

function startMinimization() {
    const currentDfa = readDFA();
    if (!currentDfa) return;
    
    minimizeLogic();
    
    document.getElementById('steps-placeholder').classList.add('hidden');
    document.getElementById('steps-container').classList.remove('hidden');
    document.getElementById('steps-container').classList.add('flex');
    
    document.getElementById('minimized-placeholder').classList.add('hidden');
    document.getElementById('minimized-container').classList.remove('hidden');
    document.getElementById('minimized-container').classList.add('flex');

    renderStep();
    // Switch tabs before rendering the graph to avoid 0x0 container size bug in vis-network
    switchTab('steps');
}

function renderStep() {
    const step = minimizationSteps[currentStep];
    document.getElementById('step-title').textContent = step.title;
    document.getElementById('step-desc').textContent = step.desc;

    document.getElementById('btn-prev').disabled = currentStep === 0;
    document.getElementById('btn-next').disabled = currentStep === minimizationSteps.length - 1;

    // Render Partitions List
    let partitionHtml = '';
    step.partitions.forEach((p, idx) => {
        let colorClass = `group-color-${idx % 8}`;
        partitionHtml += `
            <div class="p-3 border rounded-md shadow-sm ${colorClass} bg-opacity-20 flex justify-between items-center transition-all hover:shadow-md">
                <span class="font-bold text-gray-700">Group ${idx}</span>
                <span class="bg-white px-2 py-1 rounded border text-sm font-medium">{ ${p.join(', ')} }</span>
            </div>
        `;
    });
    document.getElementById('partition-list').innerHTML = partitionHtml;

    // Render Analysis
    document.getElementById('transition-analysis').innerHTML = step.analysisHtml;
}

function nextStep() {
    if (currentStep < minimizationSteps.length - 1) {
        currentStep++;
        renderStep();
    }
}

function prevStep() {
    if (currentStep > 0) {
        currentStep--;
        renderStep();
    }
}

function initOriginalNetwork() {
    const container = document.getElementById('network-original');
    const data = { nodes: originalNodes, edges: originalEdges };
    const options = {
        physics: { enabled: true, solver: 'barnesHut' },
        manipulation: {
            enabled: true,
            addNode: function (nodeData, callback) {
                let label = prompt("Enter state name:");
                if (label && label.trim() !== '') {
                    nodeData.id = label.trim();
                    nodeData.label = label.trim();
                    nodeData.shape = 'circle';
                    callback(nodeData);
                    syncGraphToInputs();
                } else {
                    callback(null);
                }
            },
            addEdge: function (edgeData, callback) {
                let label = prompt("Enter input symbol(s) for transition (comma separated):");
                if (label && label.trim() !== '') {
                    edgeData.label = label.trim();
                    edgeData.arrows = 'to';
                    callback(edgeData);
                    syncGraphToInputs();
                } else {
                    callback(null);
                }
            },
            editNode: function (nodeData, callback) {
                callback(null);
            },
            editEdge: function (edgeData, callback) {
                callback(null);
            },
            deleteNode: function (nodeData, callback) {
                callback(nodeData);
                syncGraphToInputs();
            },
            deleteEdge: function (edgeData, callback) {
                callback(edgeData);
                syncGraphToInputs();
            }
        }
    };
    originalNetwork = new vis.Network(container, data, options);
}

function syncGraphToInputs() {
    isSyncingFromGraph = true;
    const nodes = originalNodes.get();
    const edges = originalEdges.get();
    
    const states = nodes.map(n => n.id);
    const alphabetSet = new Set();
    const transMap = {};
    
    states.forEach(s => transMap[s] = {});
    
    edges.forEach(e => {
        if (!e.label) return;
        const symbols = e.label.split(',').map(s => s.trim()).filter(s => s);
        symbols.forEach(sym => {
            alphabetSet.add(sym);
            if (transMap[e.from]) {
                transMap[e.from][sym] = e.to;
            }
        });
    });
    
    const alphabet = Array.from(alphabetSet).sort();
    
    inputs.states.value = states.join(', ');
    if (alphabet.length > 0) {
        const currentAlpha = parseCommaSeparated(inputs.alphabet.value);
        const combinedAlpha = Array.from(new Set([...currentAlpha, ...alphabet])).sort();
        inputs.alphabet.value = combinedAlpha.join(', ');
    }
    
    let currentAccept = parseCommaSeparated(inputs.accept.value).filter(s => states.includes(s));
    inputs.accept.value = currentAccept.join(', ');

    const currentStart = inputs.start.value;
    inputs.start.innerHTML = '';
    states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        inputs.start.appendChild(opt);
    });
    if (states.includes(currentStart)) inputs.start.value = currentStart;
    else if (states.length > 0) inputs.start.value = states[0];

    const thead = document.getElementById('transitions-head');
    const tbody = document.getElementById('transitions-body');
    const combinedAlpha = parseCommaSeparated(inputs.alphabet.value);

    let headHTML = '<tr><th class="px-4 py-2 border-b">State</th>';
    combinedAlpha.forEach(a => headHTML += `<th class="px-4 py-2 border-b text-center">Input ${a}</th>`);
    headHTML += '</tr>';
    thead.innerHTML = headHTML;

    let bodyHTML = '';
    states.forEach(s => {
        bodyHTML += `<tr><td class="px-4 py-2 border-b font-medium">${s}</td>`;
        combinedAlpha.forEach(a => {
            let val = transMap[s] && transMap[s][a] ? transMap[s][a] : '';
            bodyHTML += `<td class="px-4 py-2 border-b"><select id="trans-${s}-${a}" class="w-full border rounded p-1 outline-none">`;
            bodyHTML += `<option value="">--</option>`;
            states.forEach(target => {
                bodyHTML += `<option value="${target}" ${val === target ? 'selected' : ''}>${target}</option>`;
            });
            bodyHTML += `</select></td>`;
        });
        bodyHTML += '</tr>';
    });
    tbody.innerHTML = bodyHTML;

    syncInputsToGraph(true); 
    isSyncingFromGraph = false;
}

function syncInputsToGraph(skipDatasetClear = false) {
    const states = parseCommaSeparated(inputs.states.value);
    const alphabet = parseCommaSeparated(inputs.alphabet.value);
    const accept = parseCommaSeparated(inputs.accept.value);
    const start = inputs.start.value;

    const newNodes = states.map(s => ({
        id: s,
        label: s,
        shape: 'circle',
        borderWidth: accept.includes(s) ? 4 : 1,
        color: {
            background: start === s ? '#fee2e2' : '#ffffff',
            border: accept.includes(s) ? '#2563eb' : '#9ca3af',
            highlight: { background: '#dbeafe', border: '#2563eb' }
        },
        font: { face: 'Inter', size: 16 }
    }));

    const newEdges = [];
    const edgeMap = {};

    states.forEach(s => {
        alphabet.forEach(a => {
            const sel = document.getElementById(`trans-${s}-${a}`);
            if (sel && sel.value) {
                const to = sel.value;
                const key = `${s}->${to}`;
                if (!edgeMap[key]) {
                    edgeMap[key] = { from: s, to: to, labels: [] };
                }
                edgeMap[key].labels.push(a);
            }
        });
    });

    Object.values(edgeMap).forEach(e => {
        newEdges.push({
            from: e.from,
            to: e.to,
            label: e.labels.join(', '),
            arrows: 'to',
            font: { align: 'top', size: 14 },
            smooth: { type: 'curvedCW', roundness: 0.2 }
        });
    });

    if (!skipDatasetClear) {
        originalNodes.clear();
        originalNodes.add(newNodes);
        originalEdges.clear();
        originalEdges.add(newEdges);
    } else {
        originalNodes.update(newNodes);
    }
}

function drawMinimizedGraph() {
    const container = document.getElementById('network-minimized');
    const dataObj = minimizedDFAData;
    if (!dataObj) return;

    const nodes = dataObj.states.map((s, idx) => {
        const label = dataObj.displayNames[idx];
        const isAccept = dataObj.accept.includes(s);
        const isStart = dataObj.start === s;
        return {
            id: s,
            label: label,
            shape: 'circle',
            borderWidth: isAccept ? 4 : 1,
            color: {
                background: isStart ? '#fee2e2' : '#ffffff',
                border: isAccept ? '#2563eb' : '#9ca3af',
                highlight: { background: '#dbeafe', border: '#2563eb' }
            },
            font: { face: 'Inter', size: 16 }
        };
    });

    const edges = [];
    const edgeMap = {};
    
    dataObj.states.forEach(s => {
        dataObj.alphabet.forEach(a => {
            const to = dataObj.transitions[s][a];
            if (to) {
                const key = `${s}->${to}`;
                if (!edgeMap[key]) {
                    edgeMap[key] = { from: s, to: to, labels: [] };
                }
                edgeMap[key].labels.push(a);
            }
        });
    });

    Object.values(edgeMap).forEach(e => {
        edges.push({
            from: e.from,
            to: e.to,
            label: e.labels.join(', '),
            arrows: 'to',
            font: { align: 'top', size: 14 },
            smooth: { type: 'curvedCW', roundness: 0.2 }
        });
    });

    const visData = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    };
    const options = {
        physics: { enabled: true, solver: 'barnesHut' }
    };
    
    if (minimizedNetwork) minimizedNetwork.destroy();
    minimizedNetwork = new vis.Network(container, visData, options);
}

function switchTab(tab) {
    ['original', 'steps', 'minimized'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const content = document.getElementById(`content-${t}`);
        if (t === tab) {
            btn.classList.add('tab-active');
            btn.classList.remove('tab-inactive');
            content.classList.remove('hidden');
            if(t === 'steps') content.classList.add('flex');
            else content.classList.add('block');
        } else {
            btn.classList.remove('tab-active');
            btn.classList.add('tab-inactive');
            content.classList.add('hidden');
            content.classList.remove('flex', 'block');
        }
    });
    if (tab === 'minimized' && minimizedDFAData) drawMinimizedGraph();
}

// Run on load
window.onload = init;