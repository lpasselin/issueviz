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
        };
        issueMap.set(name, node);
        parent.children.push(issueMap.get(name));

        // sum influences in my row
        for(const otherIssueName of issueMapNames.values()){
            let influence = parseInt(issue[otherIssueName]);
            if (influence) {
                node.influenceSum += influence;
                // node[otherIssueName] = influence;
            }
        }

        // sum influences in other rows
        for(const otherIssue of issues.slice(1)){
            let influence = parseInt(otherIssue[name]);
            if (influence) {
                node.influenceSum += influence;
                // otherIssue[name] = influence;
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
        dataNode["name"] = mapNode.name;
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

    // document.write("here 2");

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
    let k;

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

    let _node = svg.append("g");
    const relations = svg.append("g");
    
    _node = _node.selectAll("circle")
        .data(root.descendants().slice(1))
        .join("circle")
        .attr("id", d=> `circle_${d.data.name}`)
        .attr("fill", d => d.children ? color(d.depth) : "white")
        .attr("pointer-events", d => !d.children ? "none" : null)

    const node = _node.on("mouseover", function () {
            d3.select(this).attr("stroke", "#000"); 
            let d = d3.select(this).data()[0];
            if (d.depth == 0){
                return;
            }
            let issueName = d.data.name;
            let issue = issueMap.get(issueName);
            for (const otherIssueName of issueMapNames.values()) {
                let otherIssue = issueMap.get(otherIssueName);
                if (issueName === otherIssueName) {
                    continue;
                }
                let strength = parseInt(issue.csv_row[otherIssueName]);
                if (!strength) {
                    continue
                }
                let d1 = issue["d3Node"];
                let d2 = otherIssue["d3Node"];

                d3.select(document.getElementById(`circle_${otherIssueName}`)).attr("stroke", "#000").attr("stroke-width", strength).attr("stroke-opacity", 0.3);
            }
        })
        .on("mouseout", function () {
            d3.select(this).attr("stroke", null); 
            let d = d3.select(this).data()[0];
            if (d.depth == 0){
                return;
            }
            let issueName = d.data.name;
            let issue = issueMap.get(issueName);
            for (const otherIssueName of issueMapNames.values()) {
                let otherIssue = issueMap.get(otherIssueName);
                if (issueName === otherIssueName) {
                    continue;
                }
                let strength = parseInt(issue.csv_row[otherIssueName]);
                if (!strength) {
                    continue
                }
                let d1 = issue["d3Node"];
                let d2 = otherIssue["d3Node"];

                d3.select(document.getElementById(`circle_${otherIssueName}`)).attr("stroke", null).attr("stroke-width", 1).attr("stroke-opacity", 1);;
            }
            relations.html("");
        })
        .on("click", (event, d) => focus !== d && (zoom(event, d), event.stopPropagation()));

        // add relationship lines
    root.each(d => setIssueMapD3Node(d));


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
        view = v;
        k = width / v[2];

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
