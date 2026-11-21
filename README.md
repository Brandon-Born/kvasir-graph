# Kvasir Graph

Open **index.html** in Edge, Chrome, or Firefox. The editor runs locally with no installation, server, or internet connection.

## Make a graph

1. Choose **New graph** and set the largest quantity and price. The opening market diagram is an editable example. **Axes & scale** changes either axis later.
2. Choose **Draw → Straight line** and click two points. For exact intercepts, use **Enter coordinates**. Use **Draw → U-shaped** to place a minimum, then drag either arm. **Freehand** smooths a mouse or pen stroke.
3. Use **Point** to mark a crossing. **Guide** draws between two clicks and can constrain the segment horizontally or vertically. Hover previews the snap and its coordinates. Hold **Alt** to place freely.
4. Click **Shade**, click a bounded area, and enter its label and color. To combine several pieces under one label, select the area in **Graph objects**, choose **Add area**, and click the adjoining pieces.
5. With **Select**, drag a curve, its handles, or its label. The object list gives access to **Edit**, **Copy & shift**, and **Delete**. A U-shaped curve's minimum stays attached when snapped to MC. **Detach** releases its anchors.
6. The **•••** menu beside the title duplicates or renames a graph. To compare supply curves, duplicate the graph, select supply, and use **Copy & shift** with a quantity shift of 0 and the desired price shift.

## Save and export

The browser saves edits on this device. **Export → Save editable workspace** downloads all graphs as JSON and lets you move them between browsers or computers. **••• → Open workspace backup** adds the saved graphs to the current workspace.

Use **Export → Copy graph for Word** or **Download PNG** to insert a figure into the assignment. SVG is available for vector graphics. **Print or save PDF** prints the active graph. Keyboard shortcuts include Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Delete, and Escape.

## Source

The editor uses native SVG and browser pointer events. **geometry.js** splits curves and guides at intersections and builds closed faces. **model.js** resolves snapped anchors and stores graph objects. **app.js** implements drawing, editing, persistence, and export. Run the geometry regression checks with `node --test geometry.test.js`.
