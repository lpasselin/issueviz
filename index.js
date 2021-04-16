'use strict';
let issueMap;
let stakeholderMap;

(async () => {
    // main
    Papa.parse("/issues_matrix_small.csv", {
        download: true,
        complete: processCsvDataToGlobals,
        header: true,
    });
})()

function processCsvDataToGlobals(r) {
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
    for(const issue of issues) {
        issueMap.set(issue["#Issue"], "burp");
    }
    let issueMapNames =[...issueMap.keys()];
    // init root node
    issueMap.set(issueMapNames[0], { parent: null, children: [], radius: 1, });
    // init rest of the tree
    for(const issue of issues.slice(1)) {
        let parentKey = issueMapNames[parseInt(issue["Sub to"])];
        let parent = issueMap.get(parentKey);
        let node = {
            name: issue["#Issue"],
            parent: parent,
            children: [],
            radius: 1,  // TODO compute from data later
            csv_row: issue,
        };
        issueMap.set(issue["#Issue"], node);
        parent.children.push(issueMap.get(issue["#Issue"]));
    }
}

function simplifyIssueMapForD3(theMap) {
    let theMapNames = [...theMap.keys()];
    let dataNode = {
        name: theMapNames[0],
        children: []
    }
    let mapNode = theMap.get(theMapNames[0]);

    function recursiveAddChildrenData(mapNode, dataNode) {
        let hasChildren = false;
        for (const mapChild of mapNode.children) {
            let dataChild = { name: mapChild["name"], children: [] };
            recursiveAddChildrenData(mapChild, dataChild);
            dataNode.children.push(dataChild);
            hasChildren = true;
        }

        dataNode["value"] = mapNode.radius;
        
    }
    recursiveAddChildrenData(mapNode, dataNode);
    return dataNode;
}


//////////////////////////
// chart = {
//     const root = pack(data);
//     let focus = root;
//     let view;

//     var myData = [
//         { name: 'a', value: 1 },
//         { name: 'b', value: 2 },
//     ]
    
//     const div = d3.create("div")
//         .style("background-color", "red")
//         .style("width", "100%")
    
//     var select = div.append("div")
//         .style("display", "block")
//         .append("select")
//         .attr("id", "some_id")
//         .attr("onchange", d => d);

//     select.selectAll("option")
//         .data(myData).enter()
//         .append("option")
//         .html(function (d) {
//             return d.name;
//         });

//     const svg = div.append("svg").style("display", "block")
//         .attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`)
//         .style("display", "block")
//         .style("margin", "0 -14px")
//         .style("background", color(0))
//         .style("cursor", "pointer")
//         .on("click", (event) => zoom(event, root));

//     const node = svg.append("g")
//         .selectAll("circle")
//         .data(root.descendants().slice(1))
//         .join("circle")
//         .attr("fill", d => d.children ? color(d.depth) : "white")
//         .attr("pointer-events", d => !d.children ? "none" : null)
//         .on("mouseover", function () { d3.select(this).attr("stroke", "#000"); })
//         .on("mouseout", function () { d3.select(this).attr("stroke", null); })
//         .on("click", (event, d) => focus !== d && (zoom(event, d), event.stopPropagation()));

//     const label = svg.append("g")
//         .style("font", "10px sans-serif")
//         .attr("pointer-events", "none")
//         .attr("text-anchor", "middle")
//         .selectAll("text")
//         .data(root.descendants())
//         .join("text")
//         .style("fill-opacity", d => d.parent === root ? 1 : 0)
//         .style("display", d => d.parent === root ? "inline" : "none")
//         .text(d => d.data.name);

//     zoomTo([root.x, root.y, root.r * 2]);

//     function zoomTo(v) {
//     const k = width / v[2];

//     view = v;

//     label.attr("transform", d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
//     node.attr("transform", d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
//     node.attr("r", d => d.r * k);
// }

// function zoom(event, d) {
//     const focus0 = focus;

//     focus = d;

//     const transition = svg.transition()
//         .duration(event.altKey ? 7500 : 750)
//         .tween("zoom", d => {
//             const i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2]);
//             return t => zoomTo(i(t));
//         });

//     label
//         .filter(function (d) { return d.parent === focus || this.style.display === "inline"; })
//         .transition(transition)
//         .style("fill-opacity", d => d.parent === focus ? 1 : 0)
//         .on("start", function (d) { if (d.parent === focus) this.style.display = "inline"; })
//         .on("end", function (d) { if (d.parent !== focus) this.style.display = "none"; });
// }
// return div.node();
//   }


// pack = data => d3.pack()
//     .size([width, height])
//     .padding(3)
//     (d3.hierarchy(simplifyIssueMapForD3(issueMap))
//         //(d3.hierarchy(data)
//         .sum(d => d.value)
//         .sort((a, b) => b.value - a.value));

// width = 932;
// height = width;
// format = d3.format(",d");
// color = d3.scaleLinear()
//     .domain([0, 5])
//     .range(["hsl(152,80%,80%)", "hsl(228,30%,40%)"])
//     .interpolate(d3.interpolateHcl);
// d3 = require("d3@6")