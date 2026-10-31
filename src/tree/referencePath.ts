import * as path from 'path';

function isWithinDirectory(directory: string, candidate: string): boolean {
  const relativePath = path.relative(directory, candidate);
  return relativePath === ''
    || (relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath));
}

export function referenceDisplayPath(activePath: string, targetPath: string): string {
  const activeDirectory = path.dirname(path.resolve(activePath));
  const targetAbsolutePath = path.resolve(targetPath);
  const targetDirectory = path.dirname(targetAbsolutePath);
  let commonDirectory = activeDirectory;

  while (!isWithinDirectory(commonDirectory, targetDirectory)) {
    const parentDirectory = path.dirname(commonDirectory);
    if (parentDirectory === commonDirectory) {
      return path.relative(activeDirectory, targetAbsolutePath).split(path.sep).join('/');
    }
    commonDirectory = parentDirectory;
  }

  const commonDirectoryName = path.basename(commonDirectory);
  const targetBranch = path.relative(commonDirectory, targetAbsolutePath);
  return path.join('..', commonDirectoryName, targetBranch).split(path.sep).join('/');
}
