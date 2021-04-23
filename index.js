'use strict';
let issueMap; // name to issue data
let issueMapNames; // id to name
let stakeholderMap;
var GUI;
var stakeholderDropdownController;
var config = {
    "load file": function(){document.getElementById("input").click()},
    "stakeholder": "None",
    "show relations": true,
    "chart size": 400,
    "area multiplier": 1,
    "font size em": 1,
};

document.addEventListener("DOMContentLoaded", function(event) { 
    GUI = new dat.gui.GUI({hideable: true});
    GUI.add(config, "show relations");
    GUI.add(config, "load file");
    GUI.add(config, "chart size", 0, 2000).onChange(function(v){chart();});
    GUI.add(config, "area multiplier", 0.01, 10).onChange(function(v){chart();});
    GUI.add(config, "font size em", 0.01, 10).onChange(function(v){chart();});
});


let width;
let height;
function setChartWidthHeight() {
    let chartAspectRatio = (Math.max(window.innerWidth, window.innerHeight) / Math.min(window.innerWidth, window.innerHeight));
    let smallest = config["chart size"];
    let biggest = Math.trunc(smallest * chartAspectRatio);

    if (window.innerWidth > window.innerHeight) {
        width = biggest;
        height = smallest;
    }
    else {
        width = smallest;
        height = biggest;
    }
}
setChartWidthHeight();


let format = d3.format(",d");
let colorDepth = d3.scaleLinear()
    .domain([0, 5])
    .range(["white", "skyblue"])
    .interpolate(d3.interpolate);
let colorStakeholder = d3.scaleLinear()
    .domain([-10, -9, 0, 10])
    .range(["red", "red", "white", "chartreuse"])
    .interpolate(d3.interpolate);


async function parseDataFile(filename) {
    return await Papa.parse(filename, {
        download: true,
        complete: processCsvDataToGlobalsAndPlot,
        header: true,
    });
}

async function handleFilePicked() {
    const myFile = this.files[0]; 
    await parseDataFile(myFile);
}

function setStakeholderDropdown(dropdownContent) {
    if (stakeholderDropdownController) {
        GUI.remove(stakeholderDropdownController)
    }
    config["stakeholder"] = "None";
    stakeholderDropdownController = GUI.add(config, "stakeholder", dropdownContent);
    stakeholderDropdownController.onChange(function (value){chart();})
}

function processCsvDataToGlobalsAndPlot(r) {
    if (r.errors.length) {
        console.log("error obtaining csv data or parsing.");
        console.log(r.errors);
        return undefined;
    }
    console.log(r.data);
    let dataRaw = r.data;
    let stakeholderIndex = dataRaw.findIndex(row => row["#Issue"] === "#Stakeholders");
    let stakeholders = dataRaw
        .slice(stakeholderIndex, dataRaw.length)
        .filter(row => !row["#Issue"].startsWith("#"))
        .filter(row => row["#Issue"].trim().length != 0);
    let issues = dataRaw
        .slice(0, stakeholderIndex)
        .filter(row => !row["#Issue"].startsWith("#"))
        .filter(row => row["#Issue"].trim().length != 0);

    // issueMap is global and contains all data we would need.
    // Needs to be transformed into simpler object before passing to d3
    issueMap = new Map();
    issueMapNames = new Map();
    for(const issue of issues) {
        issueMap.set(issue["#Issue"], "burp");
        issueMapNames.set(issue["ID"], issue["#Issue"]);
    }
    // init root node
    issueMap.set(issueMapNames.get("0"), { parent: null, children: [], radius: 1, influenceSum: 0, csv_row: issues[0]});
    // init rest of the tree
    for(const issue of issues.slice(1)) {
        let parentKey = issueMapNames.get(issue["Sub to"]);
        let parent = issueMap.get(parentKey);
        let name = issue["#Issue"];
        let node = {
            name: name,
            parent: parent,
            children: [],
            influenceSum: 0,  // TODO compute from data later
            csv_row: issue,
            relations: {}
        };
        issueMap.set(name, node);
        parent.children.push(issueMap.get(name));
    }
        // sum influences
    for(const issueName of issueMapNames.values()){
        let issue = issueMap.get(issueName);
        if (issue === undefined){
            continue;
        }
        for(const otherIssueName of issueMapNames.values()){
            if (issueName === otherIssueName){
                continue
            }
            let otherIssue = issueMap.get(otherIssueName);
            let influence;
            // 1) check if issue has relation to otherIssue
            influence = parseInt(issue.csv_row[otherIssueName]);
            if (influence) {
                issue.influenceSum += influence;
                issue.relations[otherIssueName] = influence;
                // node[otherIssueName] = influence;
                continue;
            }
            // check if otherIssue has relation to issue
            influence = parseInt(otherIssue.csv_row[issueName]);
            if (influence) {
                issue.influenceSum += influence;
                issue.relations[otherIssueName] = influence;
                // node[otherIssueName] = influence;
                continue;
            }
        }
    }

    // stakehodlerMap is global and contains everything we need for stakeholders
    stakeholderMap = new Map();
    stakeholderMap.set("None", {name: "None"});
    for(const stakeholder of stakeholders){
        let name = stakeholder["#Issue"];
        let node = {
            name: name,
            weight: stakeholder["Sub to"],
            id: stakeholder["ID"],
            relations: {}
        }
        for (const otherIssueName of issueMapNames.values()){
            let strength = parseInt(stakeholder[otherIssueName]);
            if (!strength){
                strength = 0;
            }
            node.relations[otherIssueName] = strength;
        }
        stakeholderMap.set(name, node);
    }

    let stakeholderDropdownValues = {};
    for(const stakeholder of stakeholderMap.values()){
        stakeholderDropdownValues[stakeholder.name] = stakeholder.name;
    }
    setStakeholderDropdown(stakeholderDropdownValues);
    chart();
}

function simplifyIssueMapForD3(theMap) {
    let theMapNames = Array.from(theMap.keys());
    let dataNode = {
        name: theMapNames[0],
        children: []
    }
    let mapNode = theMap.get(theMapNames[0]);

    function recursiveAddChildrenData(mapNode, dataNode) {
        for (const mapChild of mapNode.children) {
            let dataChild = { name: mapChild["name"], children: [] };
            recursiveAddChildrenData(mapChild, dataChild);
            dataNode.children.push(dataChild);
        }
        dataNode["area"] = mapNode.influenceSum * config["area multiplier"];
        dataNode["radius"] = Math.sqrt(mapNode.influenceSum/Math.PI);
        dataNode["value"] = dataNode["area"];
        dataNode["name"] = mapNode.name;
        dataNode["relations"] = mapNode["relations"];
    }
    recursiveAddChildrenData(mapNode, dataNode);
    return dataNode;
}

function pack(data) {
    return d3.pack()
    .size([width, height])
    .padding(3)
    (d3.hierarchy(data)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value));
}

function setOpacityAll(objects, opacity) {
    for (const obj of objects) {
        obj.attr("opacity", opacity);
    }
}

function setIssueMapD3Node(d){
    if (!d.depth) {return;}
    issueMap.get(d.data.name)["d3Node"] = d;
}



function chart() {
    d3.select("#chart").html("");
    const div = d3.select("#chart")
        .style("background-color", "red")
        // .style("max-height", "95vh")
        // .style("max-width", "95vh")
        .style("display", "inline-block");

    const root = pack(simplifyIssueMapForD3(issueMap));
    let focus = root;
    let view;
    let k;

    const svg = div.append("svg").style("display", "block")
        .attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`)
        .style("display", "block")
        .attr("preserveAspectRatio", "xMinYMin meet")
        .style("margin", "0 0 0 0")
        .style("background", colorDepth(0))
        .style("cursor", "pointer")
        .on("click", (event) => zoom(event, root));

    let _node = svg.append("g");
    const relations = svg.append("g");
    
    _node = _node.selectAll("circle")
        .data(root.descendants().slice(1))
        .join("circle")
        .attr("id", d=> `circle_${d.data.name}`)
        .attr("pointer-events", d => !d.children ? "none" : null);
    
    let stakeholder = stakeholderMap.get(config.stakeholder);
    if (stakeholder.name == "None") {
        _node = _node.attr("fill", d => d.children ? colorDepth(d.depth) : "white")
    }
    else {
        console.log(stakeholder)
        _node = _node.attr("fill", d => {console.log(d.data.name, stakeholder.relations[d.data.name]); return colorStakeholder(stakeholder.relations[d.data.name])})
    }

    const node = _node.on("mouseover", function () {
            d3.select(this).attr("stroke", "black").attr("stroke-opacity", 1).attr("stroke-width", 2);
            if (config["show relations"]){
                let d = d3.select(this).data()[0];
                if (d.depth == 0){
                    return;
                }
                let issueName = d.data.name;
                let issue = issueMap.get(issueName);
                for (const [otherIssueName, strength] of Object.entries(issue.relations)){
                    d3.select(document.getElementById(`circle_${otherIssueName}`)).attr("stroke", "#000").attr("stroke-width", strength).attr("stroke-opacity", 0.3);
                }
            }
        })
        .on("mouseout", function () {
            d3.select(this).attr("stroke", "black").attr("stroke-width", 1).attr("stroke-opacity", 0.2); 
            let d = d3.select(this).data()[0];
            if (d.depth == 0){
                return;
            }
            let issueName = d.data.name;
            let issue = issueMap.get(issueName);
            for (const [otherIssueName, strength] of Object.entries(issue.relations)){
                d3.select(document.getElementById(`circle_${otherIssueName}`)).attr("stroke", "black").attr("stroke-width", 1).attr("stroke-opacity", 0.2);
            }
            relations.html("");
        })
        .on("click", (event, d) => focus !== d && (zoom(event, d), event.stopPropagation()))
        .attr("stroke", "black").attr("stroke-width", 1).attr("stroke-opacity", 0.2)

        // add relationship lines
    root.each(d => setIssueMapD3Node(d));


    const label = svg.append("g")
        .style("font", `${config["font size em"]}em sans-serif`)
        // .style("text-shadow", "white 0 0 0.25em")
        .style("fill", "black")
        .attr("pointer-events", "none")
        .attr("text-anchor", "middle")
        .selectAll("text")
        .data(root.descendants())
        .join("text")
        .style("fill-opacity", d => d.parent === root ? 1 : 0)
        .style("display", d => d.parent === root ? "inline" : "none")
        .text(d => d.data.name);

    zoomTo([root.x, root.y, root.r * 2]);

    function zoomTo(v) {
        view = v;
        k = config["chart size"] / v[2];

        label.attr("transform", d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
        node.attr("transform", d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
        node.attr("r", d => d.r * k);
    }

    function zoom(event, d) {
        const focus0 = focus;

        focus = d;

        const transition = svg.transition()
            .duration(event.altKey ? 7500 : 750)
            .tween("zoom", d => {
                const i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2]);
                return t => zoomTo(i(t));
            });

        label
            .filter(function (d) { return d.parent === focus || this.style.display === "inline"; })
            .transition(transition)
            .style("fill-opacity", d => d.parent === focus ? 1 : 0)
            .on("start", function (d) { if (d.parent === focus) this.style.display = "inline"; })
            .on("end", function (d) { if (d.parent !== focus) this.style.display = "none"; });
    }

}

function main() {
    parseDataFile("issues_matrix.csv");
    const inputElement = document.getElementById("input");
    inputElement.addEventListener("change", handleFilePicked, false);
}
