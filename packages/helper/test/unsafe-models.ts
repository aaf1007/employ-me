/** Model names that would be read as a flag, or as shell text, once they are CLI arguments. */
export const UNSAFE_MODEL_NAMES = [
  '--dangerously-skip-permissions',
  '-p',
  'sonnet; rm -rf ~',
  'sonnet --tools Bash',
  'two words',
  'sonnet\n--tools',
  '$(whoami)',
  '',
  'a'.repeat(101),
];
