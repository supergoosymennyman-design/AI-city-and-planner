using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace AI2School.Agents.Tests
{
    public class FlowFieldTests
    {
        static bool[,] Empty(int w, int h) => new bool[w, h];

        static bool[,] Wall(int w, int h, int colX)
        {
            var grid = new bool[w, h];
            for (int y = 0; y < h; y++) grid[colX, y] = true; // blocked column
            return grid;
        }

        static FlowField Bake( bool[,] blocked, int w, int h, params (int, int)[] goals)
            => FlowField.Bake(w, h, 4f, (gx, gz) => gx >= 0 && gz >= 0 && gx < w && gz < h && !blocked[gx, gz], goals);

        [Test]
        public void SameInput_SameField()
        {
            var goals = new List<(int, int)> { (9, 9) };
            var a = FlowField.Bake(10, 10, 4f, (x, z) => true, goals);
            var b = FlowField.Bake(10, 10, 4f, (x, z) => true, goals);
            for (int gz = 0; gz < 10; gz++)
            for (int gx = 0; gx < 10; gx++)
            {
                Assert.AreEqual(a.Cost(gx, gz), b.Cost(gx, gz), $"cost at {gx},{gz}");
                var da = a.SampleWorld((gx + 0.5f) * 4f, (gz + 0.5f) * 4f);
                var db = b.SampleWorld((gx + 0.5f) * 4f, (gz + 0.5f) * 4f);
                Assert.AreEqual(da.X, db.X, 1e-4f, $"dir x at {gx},{gz}");
                Assert.AreEqual(da.Y, db.Y, 1e-4f, $"dir y at {gx},{gz}");
            }
        }

        [Test]
        public void FlowsTowardGoal()
        {
            var ff = Bake(Empty(10, 10), 10, 10, (9, 9));
            // At the far corner, flow should point toward the goal (positive x,z).
            var d = ff.SampleWorld(0.5f * 4f, 0.5f * 4f);
            Assert.Greater(d.X, 0.5f, "should point +x toward goal");
            Assert.Greater(d.Y, 0.5f, "should point +z toward goal");
        }

        [Test]
        public void RoutesAroundWall_NotThrough()
        {
            int w = 20, h = 10;
            var ff = Bake(Wall(w, h, 9), w, h, (19, 5));
            // Cell directly left of the wall at y=5 must NOT point +x straight
            // into the wall (a proper route goes around via y=4 or y=6).
            var d = ff.SampleWorld(8.5f * 4f, 5.5f * 4f);
            // If it pointed straight +x it would hit the wall at x=9; require y-motion.
            Assert.Less(Mathf.Abs(d.Y), 0.999f, "flow at wall should deflect (not head straight into wall)");
        }

        [Test]
        public void UnreachableCell_HasNoFlow()
        {
            // Box in (0,0) with no walkable neighbours; goal far away at (9,9).
            var grid = new bool[10, 10];
            grid[0, 1] = true;
            grid[1, 0] = true;
            grid[1, 1] = true;
            var ff = Bake(grid, 10, 10, (9, 9));
            var d = ff.SampleWorld(0.5f * 4f, 0.5f * 4f);
            Assert.AreEqual(0f, d.X, 1e-4f);
            Assert.AreEqual(0f, d.Y, 1e-4f);
            Assert.IsFalse(ff.IsWalkable(0, 0), "trapped cell should be unreachable");
        }
    }
}
