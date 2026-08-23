using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// <summary>
/// Phase 0 crowd benchmark — validates GPU instancing of ~60 animated agents
/// at the target frame rate. Headless-friendly: logs [BENCH] lines, quits after
/// the measurement window.
///
/// This is a perf *spike*, not production code. It deliberately uses a single
/// procedural capsule mesh to measure the instancing path (draw calls + vertex
/// throughput), not real champion models or animation clips — those come later.
/// </summary>
public class CrowdBenchmark : MonoBehaviour
{
    [Tooltip("Number of instanced agents.")] public int agentCount = 60;
    [Tooltip("How long to measure before quitting (seconds).")] public float duration = 12f;

    const float Spacing = 1.6f;
    const float AgentScale = 0.55f;

    Mesh _mesh;
    Material _material;
    Matrix4x4[] _matrices;
    Camera _cam;
    float _startTime;
    int _frames;
    float _nextLogAt;

    void Start()
    {
        _mesh = BuildAgentMesh();
        _material = new Material(Shader.Find("Universal Render Pipeline/Lit"));
        if (_material == null || !_material.shader)
        {
            Debug.LogError("[BENCH] URP Lit shader not found — URP pipeline not active?");
            Application.Quit(2);
            return;
        }
        _material.enableInstancing = true;
        _material.color = new Color(0.35f, 0.8f, 1f);

        _matrices = new Matrix4x4[agentCount];
        int side = Mathf.CeilToInt(Mathf.Sqrt(agentCount));
        for (int i = 0; i < agentCount; i++)
        {
            float x = (i % side - side / 2f) * Spacing;
            float z = (i / side - side / 2f) * Spacing;
            _matrices[i] = Matrix4x4.TRS(new Vector3(x, 0f, z), Quaternion.identity, Vector3.one * AgentScale);
        }

        _cam = Camera.main;
        if (_cam != null)
        {
            _cam.transform.position = new Vector3(0f, 6f, -side * Spacing * 0.75f);
            _cam.transform.LookAt(Vector3.zero);
        }

        Application.targetFrameRate = 60;
        _startTime = Time.time;
        _nextLogAt = _startTime + 1f;

        Debug.Log($"[BENCH] start agents={agentCount} duration={duration}s rp={GraphicsSettings.currentRenderPipeline?.GetType().Name ?? "builtin"}");
    }

    void Update()
    {
        float t = Time.time;
        for (int i = 0; i < agentCount; i++)
        {
            // Procedural "animation": bob + spin so the instanced transforms
            // change every frame (forces instance matrix upload — the thing
            // that costs on real crowds) instead of a static layout.
            float phase = t * 1.3f + i * 0.71f;
            float y = Mathf.Abs(Mathf.Sin(phase)) * 0.35f;
            float ang = t * 40f + i * 17f;
            _matrices[i] = Matrix4x4.TRS(
                new Vector3(_matrices[i].m03, y, _matrices[i].m23),
                Quaternion.Euler(0f, ang, 0f),
                Vector3.one * AgentScale);
        }

        Graphics.DrawMeshInstanced(_mesh, 0, _material, _matrices, agentCount,
            null, ShadowCastingMode.On, true);

        _frames++;

        if (t >= _nextLogAt)
        {
            float fps = _frames / (t - _startTime);
            Debug.Log($"[BENCH] elapsed={t - _startTime:F1}s fps_now={1f / Mathf.Max(Time.deltaTime, 1e-4f):F1} fps_avg={fps:F1} agents={agentCount}");
            _nextLogAt = t + 1f;
        }

        if (t - _startTime >= duration)
        {
            float fps = _frames / (t - _startTime);
            Debug.Log($"[BENCH] DONE agents={agentCount} window={duration}s avg_fps={fps:F1}");
            Debug.Log($"[BENCH_RESULT] {fps:F1}");
            Application.Quit(0);
        }
    }

    /// Build a single low-poly capsule mesh for all agents (one mesh, instanced).
    static Mesh BuildAgentMesh()
    {
        var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        var mesh = Object.Instantiate(capsule.GetComponent<MeshFilter>().sharedMesh);
        Destroy(capsule);
        return mesh;
    }
}
