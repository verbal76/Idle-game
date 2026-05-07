namespace Boarder.Modes
{
    public interface IRunMode
    {
        void Begin(ulong seed);
        void Tick(float dt);
        void OnFell();
        void End();
    }
}
