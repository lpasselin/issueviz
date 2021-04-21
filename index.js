'use strict';
let issueMap; // name to issue data
let issueMapNames; // id to name
let stakeholderMap;

let width = 400;
let height = 400;
let format = d3.format(",d");
let color = d3.scaleLinear()
    .domain([0, 5])
    .range(["hsl(152,80%,80%)", "hsl(228,30%,40%)"])
    .interpolate(d3.interpolateHcl);

(async () => {
    // main
    await Papa.parse("issues_matrix.csv", {
        download: true,
        complete: processCsvDataToGlobalsAndPlot,
        header: true,
    });
})()


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

    // stakehodlerMap is global and contains everything we need for stakeholders
    stakeholderMap = new Map();
    stakeholderMap.set("No Stakeholder", {name: "No Stakeholder"});
    for(const stakeholder of stakeholders){
        let name = stakeholder["#Issue"];
        stakeholderMap.set(name, stakeholder);
        stakeholder["name"] = name;
        stakeholder["weight"] = stakeholder["Sub to"];
        delete stakeholder["#Issue"];
        delete stakeholder["Sub to"];
        delete stakeholder["ID"];  // not filled in csv;
    }


    // issueMap is global and contains all data we would need.
    // Needs to be transformed into simpler object before passing to d3
    issueMap = new Map();
    issueMapNames = new Map();
    for(const issue of issues) {
        issueMap.set(issue["#Issue"], "burp");
        issueMapNames.set(issue["ID"], issue["#Issue"]);
    }
    // init root node
    issueMap.set(issueMapNames.get("0"), { parent: null, children: [], radius: 1, });
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
        };
        issueMap.set(name, node);
        parent.children.push(issueMap.get(name));

        // sum influences in my row
        for(const otherIssueName of issueMapNames){
            let influence = parseInt(issue[otherIssueName]);
            if (influence) {
                node.influenceSum += influence;
            }
        }

        // sum influences in other rows
        for(const otherIssue of issues.slice(1)){
            let influence = parseInt(otherIssue[name]);
            if (influence) {
                node.influenceSum += influence;
            }
        }
    }
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
        dataNode["area"] = mapNode.influenceSum;
        dataNode["radius"] = Math.sqrt(mapNode.influenceSum/Math.PI);
        dataNode["value"] = dataNode["area"];
        
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

function chart() {
    // TODO split init and drawing code. To enable drawing from somewhere else.
    // currently, it removes the old div and creates a new one
    d3.select("#chart").remove();
    const div = d3.select("body")
        .append('div')
        .attr("id", "chart")
        .style("background-color", "red")
        .style("max-width", "90vh");

    const root = pack(simplifyIssueMapForD3(issueMap));
    let focus = root;
    let view;

    var myData = [];
    for(const stakeholder of stakeholderMap.values()){
        myData.push({
            name: stakeholder.name,
            value: stakeholder.name,
        });
    }
    
    var select = div.append("div")
        .style("display", "block")
        .append("select")
        .attr("id", "some_id")
        .attr("onchange", d => d);

    select.selectAll("option")
        .data(myData).enter()
        .append("option")
        .html(function (d) {
            return d.name;
        });

    const svg = div.append("svg").style("display", "block")
        .attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`)
        .style("display", "block")
        .attr("preserveAspectRatio", "xMinYMin meet")
        .style("margin", "0 -14px")
        .style("background", color(0))
        .style("cursor", "pointer")
        .on("click", (event) => zoom(event, root));

    const node = svg.append("g")
        .selectAll("circle")
        .data(root.descendants().slice(1))
        .join("circle")
        .attr("fill", d => d.children ? color(d.depth) : "white")
        .attr("pointer-events", d => !d.children ? "none" : null)
        .on("mouseover", function () { d3.select(this).attr("stroke", "#000"); })
        .on("mouseout", function () { d3.select(this).attr("stroke", null); })
        .on("click", (event, d) => focus !== d && (zoom(event, d), event.stopPropagation()));

    const label = svg.append("g")
        .style("font", "10px sans-serif")
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
        const k = width / v[2];

        view = v;

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