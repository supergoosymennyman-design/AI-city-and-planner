using System.Collections.Generic;
using NUnit.Framework;

namespace AI2School.Agents.Tests
{
    public class TrafficSimTests
    {
        static readonly Vec2[] NoPeds = System.Array.Empty<Vec2>();

        /// <summary>A 48m square ring of straights + curve corners — fully connected.</summary>
        static RoadNetwork RingNetwork()
        {
            return RoadNetwork.Build(new[]
            {
                new RoadPieceInput("road_curve", 0, 0, 0),
                new RoadPieceInput("road_curve", 48, 0, 270),
                new RoadPieceInput("road_curve", 48, 48, 180),
                new RoadPieceInput("road_curve", 0, 48, 90),
                new RoadPieceInput("road_straight", 12, 0, 0),
                new RoadPieceInput("road_straight", 24, 0, 0),
                new RoadPieceInput("road_straight", 36, 0, 0),
                new RoadPieceInput("road_straight", 12, 48, 0),
                new RoadPieceInput("road_straight", 24, 48, 0),
                new RoadPieceInput("road_straight", 36, 48, 0),
                new RoadPieceInput("road_straight", 0, 12, 90),
                new RoadPieceInput("road_straight", 0, 24, 90),
                new RoadPieceInput("road_straight", 0, 36, 90),
                new RoadPieceInput("road_straight", 48, 12, 90),
                new RoadPieceInput("road_straight", 48, 24, 90),
                new RoadPieceInput("road_straight", 48, 36, 90),
            });
        }

        [Test]
        public void SameSeed_Deterministic()
        {
            var net = RingNetwork();
            var a = new TrafficSim(net, 42, 6);
            var b = new TrafficSim(net, 42, 6);
            for (int i = 0; i < 240; i++)
            {
                a.Step(0.05f, NoPeds);
                b.Step(0.05f, NoPeds);
                for (int c = 0; c < a.Cars.Count; c++)
                {
                    Assert.AreEqual(a.Cars[c].Pos.X, b.Cars[c].Pos.X, 1e-4f, $"x mismatch car {c} step {i}");
                    Assert.AreEqual(a.Cars[c].Pos.Y, b.Cars[c].Pos.Y, 1e-4f, $"y mismatch car {c} step {i}");
                    Assert.AreEqual(a.Cars[c].Param, b.Cars[c].Param, 1e-4f, $"param mismatch car {c} step {i}");
                }
            }
        }

        [Test]
        public void DifferentSeed_Diverges()
        {
            var net = RingNetwork();
            var a = new TrafficSim(net, 1, 6);
            var b = new TrafficSim(net, 2, 6);
            for (int i = 0; i < 240; i++) { a.Step(0.05f, NoPeds); b.Step(0.05f, NoPeds); }
            bool anyDiff = false;
            for (int c = 0; c < a.Cars.Count; c++)
                if ((a.Cars[c].Pos - b.Cars[c].Pos).Magnitude > 0.5f) anyDiff = true;
            Assert.IsTrue(anyDiff, "different seeds should diverge");
        }

        [Test]
        public void Cars_StayOnRoad()
        {
            var net = RingNetwork();
            var sim = new TrafficSim(net, 7, 8);
            for (int i = 0; i < 400; i++)
            {
                sim.Step(0.05f, NoPeds);
                foreach (var c in sim.Cars)
                {
                    Assert.LessOrEqual(c.Param, net.Edges[c.Edge].Length + 0.01f, "param must stay within edge");
                    Assert.GreaterOrEqual(c.Param, 0f);
                    Assert.IsFalse(float.IsNaN(c.Pos.X) || float.IsNaN(c.Pos.Y), "no NaN positions");
                }
            }
        }

        [Test]
        public void NoRoads_NoCars()
        {
            var sim = new TrafficSim(RoadNetwork.Build(null), 1, 5);
            Assert.AreEqual(0, sim.Cars.Count);
            sim.Step(0.05f, NoPeds);   // must not throw
        }

        [Test]
        public void Cars_EndUpInsideDistrictBounds()
        {
            var net = RingNetwork();
            var sim = new TrafficSim(net, 99, 10);
            for (int i = 0; i < 400; i++) sim.Step(0.05f, NoPeds);
            foreach (var c in sim.Cars)
            {
                Assert.GreaterOrEqual(c.Pos.X, -12f, "inside ring extent");
                Assert.LessOrEqual(c.Pos.X, 60f);
                Assert.GreaterOrEqual(c.Pos.Y, -12f);
                Assert.LessOrEqual(c.Pos.Y, 60f);
            }
        }
    }
}
