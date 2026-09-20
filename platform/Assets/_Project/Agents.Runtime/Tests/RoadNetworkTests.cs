using System.Collections.Generic;
using NUnit.Framework;

namespace AI2School.Agents.Tests
{
    public class RoadNetworkTests
    {
        static RoadPieceInput Road(string id, float x, float z, float rot = 0f) =>
            new RoadPieceInput(id, x, z, rot);

        [Test]
        public void TwoStraights_EndToEnd_ShareNode()
        {
            var net = RoadNetwork.Build(new[]
            {
                Road("road_straight", 0, 0, 0),    // x[-6,6], ports at x=±6
                Road("road_straight", 12, 0, 0),   // x[6,18], ports at x=6,18
            });
            Assert.AreEqual(3, net.Nodes.Count, "ports -6, +6(shared), +18");
            Assert.AreEqual(2, net.Edges.Count);
            // Middle node shared by both edges → degree 2.
            int shared = -1;
            for (int i = 0; i < net.Nodes.Count; i++)
                if (net.Nodes[i].Degree == 2) shared = i;
            Assert.GreaterOrEqual(shared, 0, "a degree-2 node must exist");
            // Edge lengths are 12m.
            Assert.AreEqual(12f, net.Edges[0].Length, 0.01f);
            Assert.AreEqual(12f, net.Edges[1].Length, 0.01f);
        }

        [Test]
        public void Cross_ConnectsFourRoads()
        {
            var net = RoadNetwork.Build(new[]
            {
                Road("road_cross", 0, 0, 0),
                Road("road_straight", 12, 0, 0),
                Road("road_straight", -12, 0, 0),
                Road("road_straight", 0, 12, 90),
                Road("road_straight", 0, -12, 90),
            });
            // center + 4 cross ports + 4 far terminals = 9 nodes
            Assert.AreEqual(9, net.Nodes.Count);
            // 4 star edges + 4 straights = 8 edges
            Assert.AreEqual(8, net.Edges.Count);
            // center node degree 4
            int center = -1;
            for (int i = 0; i < net.Nodes.Count; i++)
                if (net.Nodes[i].Degree == 4) center = i;
            Assert.GreaterOrEqual(center, 0, "center node degree 4");
        }

        [Test]
        public void Curve_BendsPerpendicular()
        {
            var net = RoadNetwork.Build(new[]
            {
                Road("road_curve", 0, 0, 0),          // ports at (6,0) and (0,6)
                Road("road_straight", 12, 0, 0),      // -X port at x=6
                Road("road_straight", 0, 12, 90),     // -Z port at z=6
            });
            // curve ports (6,0),(0,6) + far ends (18,0),(0,18) = 4 nodes
            Assert.AreEqual(4, net.Nodes.Count);
            Assert.AreEqual(3, net.Edges.Count);
            // quarter arc r=6 → length ≈ π/2*6 ≈ 9.42
            Assert.Greater(net.Edges[0].Length, 9.0f);
            Assert.Less(net.Edges[0].Length, 10.0f);
        }

        [Test]
        public void DeadEnd_CreatesTerminalNode()
        {
            // road_end is 8x8 (port at ±4 from center); place it so its port
            // merges with the straight's port (±6 from the straight's center).
            var net = RoadNetwork.Build(new[]
            {
                Road("road_end", 2, 0, 0),        // port at x=6
                Road("road_straight", 12, 0, 0),  // -X port at x=6
            });
            // shared port (6,0) + end stub terminal (2,0) + straight far end (18,0) = 3 nodes
            Assert.AreEqual(3, net.Nodes.Count);
            Assert.AreEqual(2, net.Edges.Count);
        }

        [Test]
        public void Empty_NoRoads()
        {
            Assert.IsTrue(RoadNetwork.Build(null).IsEmpty);
            Assert.IsTrue(RoadNetwork.Build(new List<RoadPieceInput>()).IsEmpty);
        }

        [Test]
        public void KindFor_Table()
        {
            Assert.AreEqual(RoadPieceKind.Straight, RoadNetwork.KindFor("road_straight"));
            Assert.AreEqual(RoadPieceKind.Curve, RoadNetwork.KindFor("road_curve"));
            Assert.AreEqual(RoadPieceKind.Junction, RoadNetwork.KindFor("road_cross"));
            Assert.AreEqual(RoadPieceKind.End, RoadNetwork.KindFor("road_end"));
            Assert.AreEqual(RoadPieceKind.None, RoadNetwork.KindFor("housing_pod"));
            Assert.IsTrue(RoadNetwork.IsRoadPiece("road_crossing"));
            Assert.IsFalse(RoadNetwork.IsRoadPiece("park"));
        }
    }
}
