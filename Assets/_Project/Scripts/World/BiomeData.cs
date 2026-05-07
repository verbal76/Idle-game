using UnityEngine;

namespace Boarder.World
{
    [CreateAssetMenu(menuName = "Boarder/Biome", fileName = "Biome")]
    public class BiomeData : ScriptableObject
    {
        public string biomeName;
        public Material snowMaterial;
        public GameObject[] obstaclePrefabs;
        public Color skyTint = Color.white;
        public Color fogColor = Color.white;
        public float fogDensity = 0.005f;
    }
}
