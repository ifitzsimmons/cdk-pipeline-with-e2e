import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { GitHubConstants } from './constants/pipeline';
import { STAGES } from './constants/stages';
import { addStageToPipeline } from './add-stage-to-pipeline';

/**
 * Creates the pipeline with GitHub Source and a custom Synth step for the
 * ThumbnailGenerator Service. Also provisions custom stages using the list
 * of Stages defined in the pipeline constants file.
 *
 * Example:
 * ```ts
 * declare const app: cdk.App;
 * const pipelineStack = new PipelineStack(app, 'ThumbnailCdkPipelineStack', {
 *   env: {
 *     account: PIPELINE_ACCOUNT,
 *     region: PIPELINE_REGION,
 *   },
 * });
 * ```
 */
export class PipelineStack extends Stack {
  /** @constructor */
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const pipelineTrigger = CodePipelineSource.connection(
      GitHubConstants.repo,
      GitHubConstants.branch,
      { connectionArn: GitHubConstants.connection }
    );

    const synthStep = new ShellStep('Synth', {
      input: pipelineTrigger,
      commands: [
        // Install tox (required for running our python unit tests)
        'pip install tox',
        // ensure pip is up-to-date
        'python3 -m pip install --upgrade pip',
        // install lambda layer
        // https://repost.aws/knowledge-center/lambda-python-package-compatible
        'pip install \
          --target src/layers/PillowLayer/python/lib/python3.8/site-packages \
          --platform manylinux2014_x86_64 \
          --implementation cp \
          --only-binary=:all: \
          --python-version 3.8 \
          --upgrade \
          Pillow',
        // Install cdk project dependendencies
        'npm ci',
        // Set up Integration Test layer with npm dependencies
        'cd ./lib/integration-test/layers/nodejs && npm ci && cd -',
        // run Unit tests for python lambda functions
        'npm run test:lambda',
        // Synthesize CDK app
        'npm run cdk synth',
      ],
    });

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'ThumbnailServicePipeline',
      selfMutation: true,
      synth: synthStep,
    });

    STAGES.forEach(({ stageName, account }) => {
      addStageToPipeline(this, pipeline, stageName, account.id, account.region);
    });
  }
}
